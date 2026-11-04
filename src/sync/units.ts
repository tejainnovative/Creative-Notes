import { db, type ChatMessage, type Meeting, type Note, type ScoreCard, type Todo } from '../db/schema';
import { getMeeting, type MeetingDetail } from '../data/meetings';

/**
 * What gets synced, in units that change together:
 *   todo:<id>     a to-do
 *   note:<id>     a quick note
 *   chat:<id>     a message in Ask
 *   meeting:<id>  a meeting with its transcript, summary, insights, actions, notes, score and copilot chat
 * Not synced: settings, the device token, speech models, kept audio and the AI job queue.
 */

export interface MeetingUnit extends MeetingDetail {
  scoreCard?: ScoreCard;
  chat: ChatMessage[];
}
export type Unit = Todo | Note | ChatMessage | MeetingUnit;

const MEETING_TABLES = [db.meetings, db.segments, db.insights, db.summaries, db.actionItems, db.manualNotes, db.scoreCards, db.chatMessages, db.audio];

/** Keys of everything on this device that can sync now. Meetings still recording or being cleaned up wait. */
export async function localKeys(): Promise<string[]> {
  const [todos, notes, chats, meetings, withAudio] = await Promise.all([
    db.todos.toCollection().primaryKeys(),
    db.notes.toCollection().primaryKeys(),
    db.chatMessages.where('[thread+createdAt]').between(['global', -Infinity], ['global', Infinity]).primaryKeys(),
    db.meetings.toArray(),
    db.audio.orderBy('meetingId').uniqueKeys(),
  ]);
  const busy = new Set(withAudio as string[]);
  return [
    ...todos.map((id) => `todo:${id}`),
    ...notes.map((id) => `note:${id}`),
    ...chats.map((id) => `chat:${id}`),
    ...meetings.filter((m) => m.status !== 'recording' && !busy.has(m.id)).map((m) => `meeting:${m.id}`),
  ];
}

/** True if the unit is mid-recording or mid-clean-up: neither send it nor overwrite it. */
export async function isBusy(key: string): Promise<boolean> {
  const [kind, id] = split(key);
  if (kind !== 'meeting') return false;
  const m = await db.meetings.get(id);
  return m?.status === 'recording' || (await db.audio.where('meetingId').equals(id).count()) > 0;
}

function split(key: string): [string, string] {
  const at = key.indexOf(':');
  return [key.slice(0, at), key.slice(at + 1)];
}

export async function readUnit(key: string): Promise<Unit | undefined> {
  const [kind, id] = split(key);
  if (kind === 'todo') return db.todos.get(id);
  if (kind === 'note') return db.notes.get(id);
  if (kind === 'chat') return db.chatMessages.get(id);
  if (kind === 'meeting') {
    const detail = await getMeeting(id);
    if (!detail) return undefined;
    const [scoreCard, chat] = await Promise.all([
      db.scoreCards.get(id),
      db.chatMessages.where('[thread+createdAt]').between([id, -Infinity], [id, Infinity]).toArray(),
    ]);
    return { ...detail, scoreCard, chat };
  }
  return undefined;
}

export async function writeUnit(key: string, unit: Unit): Promise<void> {
  const [kind] = split(key);
  if (kind === 'todo') return void (await db.todos.put(unit as Todo));
  if (kind === 'chat') return void (await db.chatMessages.put(unit as ChatMessage));
  if (kind === 'note') {
    const note = unit as Note;
    // The Siri inbox id is unique: if this device already has that note under another id, keep ours.
    if (note.inboxId) {
      const holder = await db.notes.where('inboxId').equals(note.inboxId).first();
      if (holder && holder.id !== note.id) return;
    }
    return void (await db.notes.put(note));
  }
  if (kind === 'meeting') {
    const u = unit as MeetingUnit;
    const id = u.meeting.id;
    await db.transaction('rw', MEETING_TABLES, async () => {
      await removeMeetingParts(id);
      await db.meetings.put(u.meeting as Meeting);
      await db.segments.bulkPut(u.segments);
      await db.insights.bulkPut(u.insights);
      if (u.summary) await db.summaries.put(u.summary);
      await db.actionItems.bulkPut(u.actions);
      await db.manualNotes.bulkPut(u.manualNotes);
      if (u.scoreCard) await db.scoreCards.put(u.scoreCard);
      await db.chatMessages.bulkPut(u.chat);
    });
  }
}

async function removeMeetingParts(id: string) {
  await db.segments.where('meetingId').equals(id).delete();
  await db.insights.where('meetingId').equals(id).delete();
  await db.summaries.delete(id);
  await db.actionItems.where('meetingId').equals(id).delete();
  await db.manualNotes.where('meetingId').equals(id).delete();
  await db.scoreCards.delete(id);
  await db.chatMessages.where('[thread+createdAt]').between([id, -Infinity], [id, Infinity]).delete();
}

export async function deleteUnit(key: string): Promise<void> {
  const [kind, id] = split(key);
  if (kind === 'todo') return void (await db.todos.delete(id));
  if (kind === 'note') return void (await db.notes.delete(id));
  if (kind === 'chat') return void (await db.chatMessages.delete(id));
  if (kind === 'meeting') {
    await db.transaction('rw', [...MEETING_TABLES, db.aiJobs, db.notes], async () => {
      await removeMeetingParts(id);
      await db.aiJobs.where('[meetingId+kind]').between([id, ''], [id, '￿']).delete();
      await db.notes.where('meetingId').equals(id).modify({ meetingId: undefined });
      await db.meetings.delete(id);
    });
  }
}
