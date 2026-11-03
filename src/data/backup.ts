import Dexie from 'dexie';
import { db } from '../db/schema';
import { setSetting } from './settings';
import { searchIndex } from './search';

/**
 * Encrypted backup and restore (F08). Everything a user made goes in; secrets don't
 * (the server device token, passcode material). The file is useless without the passphrase.
 *
 * File: JSON envelope { app, kind, format, createdAt, kdf, cipher, compression, data }.
 * data = AES-GCM( gzip( JSON { schema, tables } ) ), key = PBKDF2-SHA256(passphrase, salt, 600k).
 */

export const BACKUP_FORMAT = 1;
export const MIN_PASSPHRASE = 10;
const ITERATIONS = 600_000;

/** Tables that hold the user's content, in restore order (parents first). */
const TABLES = ['meetings', 'segments', 'insights', 'summaries', 'actionItems', 'manualNotes', 'notes', 'scoreCards', 'chatMessages', 'todos'] as const;
type TableName = (typeof TABLES)[number];
/** Settings worth carrying to a new device. Never the device token or id. */
const SETTINGS = ['displayName', 'language', 'theme', 'connectivityMode'] as const;

interface Payload {
  schema: number;
  tables: Record<TableName, Record<string, unknown>[]>;
  settings: Record<string, unknown>;
}

interface Envelope {
  app: 'creative-notes';
  kind: 'backup';
  format: number;
  createdAt: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  compression: 'gzip' | 'none';
  data: string;
}

export class BackupError extends Error {
  constructor(public code: 'not_backup' | 'newer_version' | 'wrong_passphrase' | 'damaged', message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

// ---- small helpers ----

const enc = new TextEncoder();
const b64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes.slice().buffer]).stream().pipeThrough(stream)).arrayBuffer());
}

async function keyFrom(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt.slice().buffer, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// ---- back up ----

export async function createBackup(passphrase: string): Promise<File> {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error('passphrase too short');
  const tables = {} as Payload['tables'];
  await db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) tables[t] = await db.table(t).toArray();
  });
  const settings: Record<string, unknown> = {};
  for (const row of await db.settings.where('key').anyOf([...SETTINGS]).toArray()) settings[row.key] = row.value;
  const payload: Payload = { schema: db.verno, tables, settings };

  let bytes: Uint8Array = enc.encode(JSON.stringify(payload));
  const gzip = typeof CompressionStream !== 'undefined';
  if (gzip) bytes = await pipe(bytes, new CompressionStream('gzip'));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(passphrase, salt, ITERATIONS);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes.slice().buffer));

  const envelope: Envelope = {
    app: 'creative-notes',
    kind: 'backup',
    format: BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64(salt) },
    cipher: { name: 'AES-GCM', iv: b64(iv) },
    compression: gzip ? 'gzip' : 'none',
    data: b64(data),
  };
  const day = new Date().toISOString().slice(0, 10);
  await setSetting('lastBackupAt', Date.now());
  return new File([JSON.stringify(envelope)], `creative-notes-backup-${day}.cnbackup`, { type: 'application/json' });
}

// ---- restore ----

export interface OpenedBackup {
  createdAt: string;
  payload: Payload;
  counts: { meetings: number; notes: number };
  /** What a merge would actually add or update on this device. */
  newCounts: { meetings: number; notes: number; total: number };
}

function readEnvelope(text: string): Envelope {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('not_backup', "This isn't a Creative Notes backup file.");
  }
  const e = raw as Partial<Envelope>;
  if (!e || e.app !== 'creative-notes' || e.kind !== 'backup') throw new BackupError('not_backup', "This isn't a Creative Notes backup file.");
  if (typeof e.format !== 'number' || e.format > BACKUP_FORMAT)
    throw new BackupError('newer_version', 'This backup was made by a newer version of Creative Notes. Update the app, then try again.');
  if (e.kdf?.name !== 'PBKDF2' || e.cipher?.name !== 'AES-GCM' || typeof e.data !== 'string' || !e.kdf.salt || !e.cipher.iv)
    throw new BackupError('damaged', 'This backup file is damaged.');
  return e as Envelope;
}

/** A record from the file that should be written: not on this device, or newer than the copy here. */
async function wanted(table: TableName, rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const t = db.table(table);
  const pk = t.schema.primKey.keyPath as string;
  const existing = await t.bulkGet(rows.map((r) => r[pk] as string));
  return rows.filter((r, i) => {
    const here = existing[i] as Record<string, unknown> | undefined;
    if (!here) return true;
    return typeof r.updatedAt === 'number' && typeof here.updatedAt === 'number' && r.updatedAt > here.updatedAt;
  });
}

export async function openBackup(file: File, passphrase: string): Promise<OpenedBackup> {
  if (file.size > 500 * 1024 * 1024) throw new BackupError('not_backup', "This isn't a Creative Notes backup file.");
  const env = readEnvelope(await file.text());
  let bytes: Uint8Array;
  try {
    const key = await keyFrom(passphrase, unb64(env.kdf.salt), env.kdf.iterations);
    bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.cipher.iv).slice().buffer }, key, unb64(env.data).slice().buffer));
  } catch {
    // AES-GCM authenticates: a wrong passphrase and a tampered file both fail here.
    throw new BackupError('wrong_passphrase', "That passphrase doesn't open this backup.");
  }
  let payload: Payload;
  try {
    if (env.compression === 'gzip') bytes = await pipe(bytes, new DecompressionStream('gzip'));
    payload = JSON.parse(new TextDecoder().decode(bytes)) as Payload;
    if (!payload.tables || !Array.isArray(payload.tables.meetings)) throw new Error('shape');
  } catch {
    throw new BackupError('damaged', 'This backup file is damaged.');
  }
  for (const t of TABLES) payload.tables[t] = Array.isArray(payload.tables[t]) ? payload.tables[t] : [];

  const newMeetings = await wanted('meetings', payload.tables.meetings);
  const newNotes = await wanted('notes', payload.tables.notes);
  let total = 0;
  for (const t of TABLES) total += (await wanted(t, payload.tables[t])).length;
  return {
    createdAt: env.createdAt,
    payload,
    counts: { meetings: payload.tables.meetings.length, notes: payload.tables.notes.length },
    newCounts: { meetings: newMeetings.length, notes: newNotes.length, total },
  };
}

/** Merges by id in one transaction: adds what's missing, updates what's newer, never deletes. */
export async function restoreBackup(opened: OpenedBackup): Promise<{ meetings: number; notes: number }> {
  const { payload } = opened;
  let meetings = 0;
  let notes = 0;
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      let rows = await wanted(t, payload.tables[t]);
      if (t === 'notes') {
        // A note pulled from the Siri inbox on both devices has the same inboxId under a different id.
        // Keep the local one; writing the other would break the unique inboxId index.
        const inboxIds = rows.map((r) => r.inboxId).filter((v): v is string => typeof v === 'string');
        const holder = new Map((await db.notes.where('inboxId').anyOf(inboxIds).toArray()).map((n) => [n.inboxId, n.id]));
        rows = rows.filter((r) => !(typeof r.inboxId === 'string' && holder.has(r.inboxId) && holder.get(r.inboxId) !== r.id));
      }
      if (t === 'meetings') meetings = rows.length;
      if (t === 'notes') notes = rows.length;
      try {
        await db.table(t).bulkPut(rows);
      } catch (err) {
        if (!(err instanceof Dexie.BulkError)) throw err;
      }
    }
  });
  for (const [key, value] of Object.entries(payload.settings ?? {}))
    if ((SETTINGS as readonly string[]).includes(key)) {
      const here = await db.settings.get(key);
      if (here === undefined || here.value === '' || here.value === undefined) await setSetting(key as (typeof SETTINGS)[number], value as never);
    }
  searchIndex.reset();
  return { meetings, notes };
}
