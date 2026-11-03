import { db } from '../db/schema';

/** Asks the browser not to evict our data under storage pressure (security review row 7). */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | undefined> {
  if (!navigator.storage?.estimate) return undefined;
  const [{ usage = 0, quota = 0 }, persisted] = await Promise.all([navigator.storage.estimate(), navigator.storage.persisted?.() ?? false]);
  return { usage, quota, persisted };
}

/** Clears every table and the app's caches on this device. */
export async function deleteEverything(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  if ('caches' in window) {
    for (const key of await caches.keys()) if (!key.startsWith('workbox-precache')) await caches.delete(key);
  }
}
