import Dexie from 'dexie';
import { createNote } from '../data/notes';
import { getSettings } from '../data/settings';
import { apiFetch, serverStatus } from './api';

/**
 * Pulls Siri / Shortcut notes waiting on the server into local quick notes, then
 * acknowledges them so the server deletes its copy. A note already pulled (same
 * inbox id) is skipped, so a crash between save and ack can't duplicate it.
 */
export async function pullInbox(): Promise<number> {
  const { deviceToken } = await getSettings();
  const s = serverStatus.get();
  if (!deviceToken || !s.reachable || !s.inbox) return 0;
  const { items } = (await (await apiFetch('/inbox')).json()) as { items: { id: string; text: string; created_at: number }[] };
  const done: string[] = [];
  for (const item of items) {
    try {
      await createNote({ text: item.text, source: 'inbox', inboxId: item.id, createdAt: item.created_at });
    } catch (err) {
      if (!(err instanceof Dexie.ConstraintError)) throw err;
    }
    done.push(item.id);
  }
  if (done.length) await apiFetch('/inbox/ack', { body: { ids: done } });
  return done.length;
}
