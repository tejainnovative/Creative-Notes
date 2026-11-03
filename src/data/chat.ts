import { db, type ChatMessage } from '../db/schema';
import { uuidv7 } from '../db/ids';
import { getAi } from '../ai/client';
import type { ChatInput } from '../ai/types';
import { meetingTitle } from './meetings';
import { searchIndex } from './search';

export async function listThread(thread: string): Promise<ChatMessage[]> {
  return db.chatMessages.where('[thread+createdAt]').between([thread, -Infinity], [thread, Infinity]).toArray();
}

export async function clearThread(thread: string): Promise<void> {
  await db.chatMessages.where('[thread+createdAt]').between([thread, -Infinity], [thread, Infinity]).delete();
}

/** Snippets for one meeting's copilot: its transcript and notes. */
export async function meetingSnippets(meetingId: string): Promise<ChatInput['snippets']> {
  const m = await db.meetings.get(meetingId);
  if (!m) return [];
  const segs = await db.segments.where('meetingId').equals(meetingId).toArray();
  const notes = await db.manualNotes.where('meetingId').equals(meetingId).toArray();
  const title = meetingTitle(m);
  return [...segs.map((s) => s.text ?? ''), ...notes.map((n) => n.text ?? '')]
    .filter(Boolean)
    .map((text) => ({ meetingId, title, text }));
}

/** Snippets for Ask: retrieval happens on the device, only matches go to the AI. */
export async function librarySnippets(question: string): Promise<ChatInput['snippets']> {
  const ids = (await searchIndex.meetingIds(question.replace(/[?!.,]/g, ' '))).slice(0, 8);
  const pool = ids.length ? ids : (await db.meetings.orderBy('startedAt').reverse().limit(5).primaryKeys()) as string[];
  const out: ChatInput['snippets'] = [];
  for (const id of pool) {
    const m = await db.meetings.get(id);
    if (!m) continue;
    const summary = await db.summaries.get(id);
    const actions = await db.actionItems.where('meetingId').equals(id).toArray();
    const title = meetingTitle(m);
    if (summary?.overview) out.push({ meetingId: id, title, text: summary.overview });
    for (const d of summary?.decisions ?? []) out.push({ meetingId: id, title, text: d });
    for (const a of actions) out.push({ meetingId: id, title, text: `${a.owner ? `${a.owner}: ` : ''}${a.text}${a.dueText ? ` (by ${a.dueText})` : ''}` });
    for (const s of await db.segments.where('meetingId').equals(id).limit(40).toArray()) out.push({ meetingId: id, title, text: s.text ?? '' });
  }
  return out;
}

/** Saves the question, streams the answer through onDelta, saves the answer. Throws AiUnavailableError offline. */
export async function askInThread(
  thread: string,
  question: string,
  snippets: ChatInput['snippets'],
  onDelta: (text: string) => void,
): Promise<ChatMessage> {
  const now = Date.now();
  await db.chatMessages.add({ id: uuidv7(now), thread, role: 'user', content: question, createdAt: now });
  const result = await getAi().answer({ question, snippets }, onDelta);
  const answer: ChatMessage = { id: uuidv7(), thread, role: 'assistant', content: result.answer, citations: result.citations, createdAt: Date.now() };
  await db.chatMessages.add(answer);
  return answer;
}
