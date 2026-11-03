import { db, type Note } from '../db/schema';
import { uuidv7 } from '../db/ids';
import { searchIndex } from './search';

export const NOTE_MAX = 4000;

export async function createNote({ text, source, meetingId, inboxId, createdAt }: { text: string; source: Note['source']; meetingId?: string; inboxId?: string; createdAt?: number }): Promise<Note> {
  const now = createdAt ?? Date.now();
  const note: Note = { id: uuidv7(now), text: text.trim().slice(0, NOTE_MAX), source, meetingId, inboxId, createdAt: now, updatedAt: Date.now() };
  await db.notes.add(note);
  searchIndex.upsertNote(note.id, note.text ?? '');
  return note;
}

export async function updateNote(id: string, text: string): Promise<void> {
  await db.notes.update(id, { text: text.trim().slice(0, NOTE_MAX), updatedAt: Date.now() });
  searchIndex.upsertNote(id, text);
}

export async function listNotes({ query, limit = 200 }: { query?: string; limit?: number } = {}): Promise<Note[]> {
  if (query?.trim()) {
    const ids = await searchIndex.noteIds(query);
    return (await db.notes.bulkGet(ids)).filter((n): n is Note => !!n).slice(0, limit);
  }
  return db.notes.orderBy('createdAt').reverse().limit(limit).toArray();
}

export async function deleteNote(id: string): Promise<Note | undefined> {
  const note = await db.notes.get(id);
  await db.notes.delete(id);
  searchIndex.removeNote(id);
  return note;
}

export async function restoreNote(note: Note): Promise<void> {
  await db.notes.put(note);
  searchIndex.upsertNote(note.id, note.text ?? '');
}
