import Dexie from 'dexie';
import { useSyncExternalStore } from 'react';
import { db } from '../db/schema';
import { getSettings, setSetting } from '../data/settings';
import { searchIndex } from '../data/search';
import { apiFetch, ApiError } from '../net/api';
import { b64, checkVerifier, deriveRaw, importKeys, makeVerifier, open, remoteKey, seal, sha256, unb64, type SyncKeys } from './crypto';
import { deleteUnit, isBusy, localKeys, readUnit, writeUnit, type Unit } from './units';

/**
 * Sync between your devices through your server, end-to-end encrypted.
 *
 * Each unit (a to-do, a note, a meeting with everything under it) is hashed. A sync first pulls
 * what other devices sent since the last pull, then pushes every unit whose hash changed since it
 * was last synced, and a tombstone for every unit deleted here. If a unit changed on this device
 * and on another one since the last sync, this device's version wins and is pushed: syncs run a
 * few seconds after every change, so that only happens when both devices edit the same thing offline.
 */

export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncStatus {
  state: SyncState;
  lastSyncAt: number;
  error?: 'wrong_passphrase' | 'not_paired' | 'server' | 'reset';
  /** What failed, for troubleshooting: the step and the browser's error. */
  detail?: string;
}

let status: SyncStatus = { state: 'off', lastSyncAt: 0 };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const fn of listeners) fn();
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
export const useSync = () => useSyncExternalStore(subscribe, () => status);

interface Payload {
  k: string;
  u: Unit;
}

let keysCache: { raw: string; keys: SyncKeys } | null = null;
async function keys(): Promise<SyncKeys | null> {
  const { syncKey } = await getSettings();
  if (!syncKey) return null;
  if (keysCache?.raw !== syncKey) keysCache = { raw: syncKey, keys: await importKeys(unb64(syncKey)) };
  return keysCache.keys;
}

const hashOf = (u: Unit) => sha256(JSON.stringify(u));

export class SyncSetupError extends Error {
  constructor(public code: 'wrong_passphrase' | 'not_paired' | 'server' | 'reset') {
    super(code);
  }
}

/**
 * Turns sync on with the passphrase. The first device creates the sync space; every other
 * device must use the same passphrase, which is checked against the space's verifier.
 */
export async function enableSync(passphrase: string): Promise<'created' | 'joined'> {
  const { deviceToken } = await getSettings();
  if (!deviceToken) throw new SyncSetupError('not_paired');
  let space: { salt: string; verifier: string } | null = null;
  try {
    const got = (await (await apiFetch('/sync/space')).json()) as { salt: string | null; verifier: string | null };
    if (got.salt && got.verifier) space = { salt: got.salt, verifier: got.verifier };
  } catch {
    throw new SyncSetupError('server');
  }
  let outcome: 'created' | 'joined' = 'joined';
  if (!space) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const raw = await deriveRaw(passphrase, salt);
    const verifier = await makeVerifier(await importKeys(raw));
    const res = await fetchSpacePut(b64(salt), verifier);
    if (res.created) {
      await turnOn(raw);
      return 'created';
    }
    space = res.space; // another device got there first: join it
    outcome = 'joined';
  }
  const raw = await deriveRaw(passphrase, unb64(space.salt));
  if (!(await checkVerifier(await importKeys(raw), space.verifier))) throw new SyncSetupError('wrong_passphrase');
  await turnOn(raw);
  return outcome;
}

async function fetchSpacePut(salt: string, verifier: string): Promise<{ created: true } | { created: false; space: { salt: string; verifier: string } }> {
  try {
    await apiFetch('/sync/space', { method: 'PUT', body: { salt, verifier } });
    return { created: true };
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const space = (await (await apiFetch('/sync/space')).json()) as { salt: string; verifier: string };
      return { created: false, space };
    }
    throw new SyncSetupError('server');
  }
}

async function turnOn(raw: Uint8Array) {
  await db.syncMeta.clear();
  await setSetting('syncCursor', 0);
  await setSetting('syncKey', b64(raw));
  localDirty = true;
  verifiedAt = 0;
  setStatus({ state: 'idle', error: undefined });
}

/** Turns sync off on this device only. Data here and on the server stays. */
export async function disableSync(): Promise<void> {
  await setSetting('syncKey', '');
  await setSetting('syncCursor', 0);
  await db.syncMeta.clear();
  keysCache = null;
  setStatus({ state: 'off', error: undefined });
}

/** Forgotten passphrase: empties the server's copy so sync can start again. Devices keep their data. */
export async function resetSyncSpace(): Promise<void> {
  await apiFetch('/sync/space', { method: 'DELETE' });
  await disableSync();
}

let running: Promise<void> | null = null;
let again = false;
/** Something changed here since the last upload. True at start: changes made while sync was off. */
let localDirty = true;
let verifiedAt = 0;

/** Runs a sync now (or once more after the one in progress). Never throws. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce(): Promise<void> {
  const k = await keys();
  const s = await getSettings();
  if (!k) return setStatus({ state: 'off', lastSyncAt: s.lastSyncAt });
  if (!s.deviceToken) return setStatus({ state: 'error', error: 'not_paired', lastSyncAt: s.lastSyncAt });
  if (!navigator.onLine) return setStatus({ state: 'offline', lastSyncAt: s.lastSyncAt });
  setStatus({ state: 'syncing', lastSyncAt: s.lastSyncAt });
  step = 'start';
  try {
    // The space can be reset from another device; then this key no longer fits. Checked now and then.
    if (Date.now() - verifiedAt > 5 * 60_000) {
      const space = (await (await apiFetch('/sync/space')).json()) as { verifier: string | null };
      if (!space.verifier) throw new SyncSetupError('reset');
      if (!(await checkVerifier(k, space.verifier))) throw new SyncSetupError('wrong_passphrase');
      verifiedAt = Date.now();
    }
    const changed = await pull(k, s.syncCursor);
    // Uploading means hashing everything here, so only after something changed on this device.
    if (localDirty) {
      localDirty = false;
      await push(k);
    }
    if (changed) searchIndex.reset();
    const t = Date.now();
    await setSetting('lastSyncAt', t);
    setStatus({ state: 'idle', lastSyncAt: t, error: undefined, detail: undefined });
  } catch (err) {
    verifiedAt = 0;
    localDirty = true; // try the upload again next time
    if (err instanceof SyncSetupError && err.code === 'reset') {
      await disableSync();
      return setStatus({ state: 'error', error: 'reset' });
    }
    if (err instanceof SyncSetupError && err.code === 'wrong_passphrase') return setStatus({ state: 'error', error: 'wrong_passphrase' });
    if (err instanceof ApiError && err.code === 'not_paired') return setStatus({ state: 'error', error: 'not_paired' });
    const e = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    setStatus({ state: navigator.onLine ? 'error' : 'offline', error: navigator.onLine ? 'server' : undefined, detail: `${step} · ${e}`.slice(0, 200) });
  }
}

/** Applies what other devices sent. Returns true if anything here changed. */
/** Where a sync is, so an error can say which step failed. */
let step = '';

async function pull(k: SyncKeys, cursor: number): Promise<boolean> {
  let changed = false;
  for (;;) {
    const page = (await (await apiFetch(`/sync/items?since=${cursor}`)).json()) as {
      items: { key: string; iv?: string; data?: string; deleted: boolean }[];
      more: boolean;
      cursor: number;
    };
    for (const item of page.items) {
      step = `pull ${item.deleted ? 'delete' : 'apply'}`;
      if (item.deleted) {
        const meta = await db.syncMeta.where('rkey').equals(item.key).first();
        if (!meta) continue;
        const here = await readUnit(meta.key);
        // Deleted elsewhere: delete here too, unless it was changed here since (then it comes back).
        if (here && (await hashOf(here)) !== meta.hash) continue;
        if (await isBusy(meta.key)) continue;
        await deleteUnit(meta.key);
        await db.syncMeta.delete(meta.key);
        changed = true;
        continue;
      }
      let payload: Payload;
      try {
        payload = await open<Payload>(k, item.iv!, item.data!);
      } catch {
        continue; // not ours to read (shouldn't happen with a matching verifier)
      }
      const meta = await db.syncMeta.get(payload.k);
      const here = await readUnit(payload.k);
      const editedHere = here ? (await hashOf(here)) !== meta?.hash : false;
      if (editedHere || (await isBusy(payload.k))) continue; // ours wins, and is pushed next
      await writeUnit(payload.k, payload.u);
      const now = await readUnit(payload.k);
      if (now) await db.syncMeta.put({ key: payload.k, rkey: item.key, hash: await hashOf(now) });
      changed = true;
    }
    cursor = page.cursor;
    await setSetting('syncCursor', cursor);
    if (!page.more) return changed;
  }
}

/** Sends what changed or was deleted here since the last sync. */
async function push(k: SyncKeys): Promise<void> {
  step = 'push list';
  const keysHere = await localKeys();
  const metas = new Map((await db.syncMeta.toArray()).map((m) => [m.key, m]));
  type Out = { item: { key: string; iv?: string; data?: string; deleted: boolean }; meta?: { key: string; rkey: string; hash: string }; drop?: string; size: number };
  let batch: Out[] = [];
  let size = 0;

  const flush = async () => {
    if (!batch.length) return;
    step = 'push send';
    const res = await apiFetch('/sync/items', { body: { items: batch.map((b) => b.item) } });
    const { cursor } = (await res.json()) as { cursor: number };
    await db.transaction('rw', db.syncMeta, async () => {
      for (const b of batch) {
        if (b.meta) await db.syncMeta.put(b.meta);
        if (b.drop) await db.syncMeta.delete(b.drop);
      }
    });
    // Our own writes are the newest on the server; skip past them next pull if nothing came in between.
    const { syncCursor } = await getSettings();
    if (cursor - batch.length === syncCursor) await setSetting('syncCursor', cursor);
    batch = [];
    size = 0;
  };
  const add = async (o: Out) => {
    if (batch.length >= 50 || size + o.size > 4 * 1024 * 1024) await flush();
    batch.push(o);
    size += o.size;
  };

  for (const key of keysHere) {
    step = `push ${key.split(':')[0]}`;
    const unit = await readUnit(key);
    if (!unit) continue;
    const hash = await hashOf(unit);
    const meta = metas.get(key);
    metas.delete(key);
    if (meta?.hash === hash) continue;
    const rkey = meta?.rkey ?? (await remoteKey(k, key));
    const sealed = await seal(k, { k: key, u: unit } satisfies Payload);
    await add({ item: { key: rkey, ...sealed, deleted: false }, meta: { key, rkey, hash }, size: sealed.data.length });
  }
  // Left over: synced before, gone now. A unit that is only busy (recording) is not deleted.
  for (const meta of metas.values()) {
    if (await isBusy(meta.key)) continue;
    if (await readUnit(meta.key)) continue;
    await add({ item: { key: meta.rkey, deleted: true }, drop: meta.key, size: 100 });
  }
  await flush();
}

// ---- when to sync: on start, coming online, returning to the app, and a few seconds after any change ----

let timer: ReturnType<typeof setTimeout> | undefined;
const SYNCED_TABLES = new Set(['todos', 'notes', 'chatMessages', 'meetings', 'segments', 'insights', 'summaries', 'actionItems', 'manualNotes', 'scoreCards']);

export function scheduleSync(delay = 3000) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

/** Starts automatic syncing. Returns a function that stops it. */
export function startAutoSync(): () => void {
  const onChange = (parts: Record<string, unknown>) => {
    // Dexie reports keys like "idb://creative-notes/todos/..."; only content tables matter.
    if (Object.keys(parts).some((p) => SYNCED_TABLES.has(p.split('/')[3] ?? ''))) {
      localDirty = true;
      scheduleSync();
    }
  };
  const onVisible = () => document.visibilityState === 'visible' && scheduleSync(200);
  const onOnline = () => scheduleSync(500);
  Dexie.on('storagemutated', onChange);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  // While the app is on screen, check for changes from other devices every 15 seconds.
  const every = setInterval(() => document.visibilityState === 'visible' && void syncNow(), 15_000);
  void syncNow();
  return () => {
    Dexie.on('storagemutated').unsubscribe(onChange);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
    clearInterval(every);
    clearTimeout(timer);
  };
}
