import { db, type ActionItem, type CaptureMode, type Insight, type ManualNote, type Meeting, type Segment, type Summary } from '../db/schema';
import { uuidv7 } from '../db/ids';
import { enqueueAiJob } from './jobs';
import { searchIndex } from './search';

export interface MeetingDetail {
  meeting: Meeting;
  segments: Segment[];
  insights: Insight[];
  summary?: Summary;
  actions: ActionItem[];
  manualNotes: ManualNote[];
}

export function meetingTitle(m: Pick<Meeting, 'title' | 'startedAt'>): string {
  if (m.title?.trim()) return m.title.trim();
  const d = new Date(m.startedAt);
  return `Recording ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

export async function listMeetings({ query, limit = 200 }: { query?: string; limit?: number } = {}): Promise<Meeting[]> {
  if (query?.trim()) {
    const ids = await searchIndex.meetingIds(query);
    const found = await db.meetings.bulkGet(ids);
    return found.filter((m): m is Meeting => !!m).slice(0, limit);
  }
  return db.meetings.orderBy('startedAt').reverse().limit(limit).toArray();
}

export async function getMeeting(id: string): Promise<MeetingDetail | undefined> {
  const meeting = await db.meetings.get(id);
  if (!meeting) return undefined;
  const [segments, insights, summary, actions, manualNotes] = await Promise.all([
    db.segments.where('[meetingId+startMs]').between([id, -Infinity], [id, Infinity]).toArray(),
    db.insights.where('[meetingId+atMs]').between([id, -Infinity], [id, Infinity]).toArray(),
    db.summaries.get(id),
    db.actionItems.where('meetingId').equals(id).toArray(),
    db.manualNotes.where('[meetingId+atMs]').between([id, -Infinity], [id, Infinity]).toArray(),
  ]);
  actions.sort((a, b) => a.priority - b.priority);
  return { meeting, segments, insights, summary, actions, manualNotes };
}

export async function startMeeting({ title, mode, language }: { title?: string; mode: CaptureMode; language?: string }): Promise<Meeting> {
  const now = Date.now();
  const meeting: Meeting = {
    id: uuidv7(now),
    title,
    startedAt: now,
    status: 'recording',
    captureMode: mode,
    aiStatus: 'pending',
    language: language ?? 'auto',
    source: 'live',
    createdAt: now,
    updatedAt: now,
  };
  await db.meetings.add(meeting);
  return meeting;
}

export async function setCaptureMode(id: string, captureMode: CaptureMode): Promise<void> {
  await db.meetings.update(id, { captureMode, updatedAt: Date.now() });
}

export async function appendSegment(meetingId: string, seg: Omit<Segment, 'id' | 'meetingId'>): Promise<Segment> {
  const row: Segment = { ...seg, id: uuidv7(), meetingId };
  await db.segments.add(row);
  return row;
}

export async function addManualNote(meetingId: string, text: string, atMs: number): Promise<void> {
  await db.manualNotes.add({ id: uuidv7(), meetingId, text, atMs });
}

export async function renameMeeting(id: string, title: string): Promise<void> {
  await db.meetings.update(id, { title: title.trim() || undefined, updatedAt: Date.now() });
  void searchIndex.refreshMeeting(id);
}

/**
 * Ends the recording and queues the summary. Very short or silent meetings are marked done with no summary.
 * `endedAt` defaults to now; recovery passes the time of the last words captured instead.
 */
export async function endMeeting(id: string, endedAtOverride?: number): Promise<void> {
  const meeting = await db.meetings.get(id);
  if (!meeting) return;
  const endedAt = endedAtOverride ?? Date.now();
  const segCount = await db.segments.where('meetingId').equals(id).count();
  const speakers = new Set((await db.segments.where('meetingId').equals(id).toArray()).map((s) => s.speaker).filter(Boolean));
  // Audio kept for the clean-up pass: the summary waits until the transcript has been re-read.
  const hasAudio = (await db.audio.where('meetingId').equals(id).count()) > 0;
  const hasContent = segCount > 0 || hasAudio;
  await db.meetings.update(id, {
    endedAt,
    durationS: Math.round((endedAt - meeting.startedAt) / 1000),
    speakerCount: speakers.size || undefined,
    status: hasContent ? 'processing' : 'done',
    aiStatus: hasContent ? 'pending' : 'done',
    updatedAt: endedAt,
  });
  if (hasContent && !hasAudio) await enqueueAiJob(id, 'summary');
  void searchIndex.refreshMeeting(id);
}

/** Deletes a meeting and everything under it in one transaction. Returns a snapshot for undo. */
export async function deleteMeeting(id: string): Promise<MeetingDetail | undefined> {
  const snapshot = await getMeeting(id);
  if (!snapshot) return undefined;
  await db.transaction('rw', [db.meetings, db.segments, db.insights, db.summaries, db.actionItems, db.manualNotes, db.scoreCards, db.chatMessages, db.aiJobs, db.notes, db.audio], async () => {
    await db.segments.where('meetingId').equals(id).delete();
    await db.audio.where('meetingId').equals(id).delete();
    await db.insights.where('meetingId').equals(id).delete();
    await db.summaries.delete(id);
    await db.actionItems.where('meetingId').equals(id).delete();
    await db.manualNotes.where('meetingId').equals(id).delete();
    await db.scoreCards.delete(id);
    await db.chatMessages.where('[thread+createdAt]').between([id, -Infinity], [id, Infinity]).delete();
    await db.aiJobs.where('[meetingId+kind]').between([id, ''], [id, '￿']).delete();
    await db.notes.where('meetingId').equals(id).modify({ meetingId: undefined });
    await db.meetings.delete(id);
  });
  searchIndex.removeMeeting(id);
  return snapshot;
}

export async function restoreMeeting(s: MeetingDetail): Promise<void> {
  await db.transaction('rw', [db.meetings, db.segments, db.insights, db.summaries, db.actionItems, db.manualNotes], async () => {
    await db.meetings.put(s.meeting);
    await db.segments.bulkPut(s.segments);
    await db.insights.bulkPut(s.insights);
    if (s.summary) await db.summaries.put(s.summary);
    await db.actionItems.bulkPut(s.actions);
    await db.manualNotes.bulkPut(s.manualNotes);
  });
  void searchIndex.refreshMeeting(s.meeting.id);
}

export async function setActionDone(id: string, done: boolean): Promise<void> {
  await db.actionItems.update(id, { done: done ? 1 : 0, completedAt: done ? Date.now() : undefined });
}

export interface HomeStats {
  today: number;
  insights: number;
  openActions: number;
}

export async function homeStats(): Promise<HomeStats> {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const [today, insights, openActions] = await Promise.all([
    db.meetings.where('startedAt').aboveOrEqual(midnight.getTime()).count(),
    db.insights.count(),
    Promise.all([db.actionItems.where('done').equals(0).count(), db.todos.where('done').equals(0).count()]).then(([a, t]) => a + t),
  ]);
  return { today, insights, openActions };
}
