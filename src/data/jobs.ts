import { db, type AiJob } from '../db/schema';
import { uuidv7 } from '../db/ids';
import { getAi } from '../ai/client';
import { AiUnavailableError } from '../ai/types';
import { searchIndex } from './search';

const MAX_ATTEMPTS = 8;
const backoff = (attempt: number) => Math.min(60 * 60_000, 30_000 * 2 ** (attempt - 1));

/** Live overview text while a summary streams, keyed by meeting id. Screens subscribe to it. */
const streaming = new Map<string, string>();
const listeners = new Set<() => void>();
export const summaryStream = {
  get: (id: string) => streaming.get(id),
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
function emit() {
  for (const fn of listeners) fn();
}

/** One job per meeting and kind: a second enqueue resets the existing job instead of duplicating it. */
export async function enqueueAiJob(meetingId: string, kind: AiJob['kind']): Promise<void> {
  const now = Date.now();
  const existing = await db.aiJobs.where('[meetingId+kind]').equals([meetingId, kind]).first();
  if (existing) {
    await db.aiJobs.update(existing.id, { status: 'queued', attempts: 0, nextRunAt: now, lastError: undefined, updatedAt: now });
  } else {
    await db.aiJobs.add({ id: uuidv7(now), meetingId, kind, status: 'queued', attempts: 0, nextRunAt: now, createdAt: now, updatedAt: now });
  }
  await db.meetings.update(meetingId, { aiStatus: 'pending', status: 'processing' });
  void runAiJobs();
}

async function runSummary(job: AiJob): Promise<void> {
  const meeting = await db.meetings.get(job.meetingId);
  if (!meeting) return; // deleted while queued
  const [segments, manualNotes] = await Promise.all([
    db.segments.where('[meetingId+startMs]').between([job.meetingId, -Infinity], [job.meetingId, Infinity]).toArray(),
    db.manualNotes.where('meetingId').equals(job.meetingId).toArray(),
  ]);
  const started = performance.now();
  await db.meetings.update(job.meetingId, { aiStatus: 'running' });
  const ai = getAi();
  const result = await ai.summarize(
    {
      meetingId: job.meetingId,
      segments: segments.map((s) => ({ speaker: s.speaker, text: s.text ?? '', startMs: s.startMs })),
      manualNotes: manualNotes.map((n) => ({ text: n.text ?? '', atMs: n.atMs })),
      language: meeting.language ?? 'auto',
    },
    (text) => {
      streaming.set(job.meetingId, text);
      emit();
    },
  );
  const now = Date.now();
  await db.transaction('rw', [db.meetings, db.summaries, db.actionItems, db.insights], async () => {
    if (!(await db.meetings.get(job.meetingId))) return;
    await db.summaries.put({
      meetingId: job.meetingId,
      overview: result.overview,
      decisions: result.decisions,
      keyTopics: result.keyTopics,
      generatedMs: Math.round(performance.now() - started),
      model: result.model,
      updatedAt: now,
    });
    await db.actionItems.where('meetingId').equals(job.meetingId).delete();
    await db.actionItems.bulkAdd(result.actionItems.slice(0, 7).map((a) => ({ id: uuidv7(), meetingId: job.meetingId, ...a, done: 0 as const })));
    await db.insights.where('meetingId').equals(job.meetingId).delete();
    await db.insights.bulkAdd(result.insights.map((i) => ({ id: uuidv7(), meetingId: job.meetingId, ...i })));
    await db.meetings.update(job.meetingId, { aiStatus: 'done', status: 'done', updatedAt: now });
  });
  streaming.delete(job.meetingId);
  emit();
  void searchIndex.refreshMeeting(job.meetingId);
}

let running: Promise<void> | null = null;

/**
 * Runs due jobs one at a time. A Web Lock keeps two tabs from running the same queue.
 * Called on app start, when the connection comes back, and after a meeting ends.
 */
export function runAiJobs(): Promise<void> {
  if (running) return running;
  const work = async () => {
    for (;;) {
      const job = await db.aiJobs.where('status').equals('queued').and((j) => j.nextRunAt <= Date.now()).first();
      if (!job) return;
      await db.aiJobs.update(job.id, { status: 'running', updatedAt: Date.now() });
      try {
        if (job.kind === 'summary') await runSummary(job);
        await db.aiJobs.update(job.id, { status: 'done', updatedAt: Date.now() });
      } catch (err) {
        // Offline or offline-only: not a failure, wait for the 'online' event or the setting to change.
        // Anything else (server busy, down, rate limited, bad output): count it and back off.
        const reason = err instanceof AiUnavailableError ? err.message : err instanceof Error ? err.message || err.name : 'error';
        const waitForNetwork = isNetworkWait(reason);
        const attempts = waitForNetwork ? job.attempts : job.attempts + 1;
        const failed = !waitForNetwork && attempts >= MAX_ATTEMPTS;
        await db.aiJobs.update(job.id, {
          status: failed ? 'failed' : 'queued',
          attempts,
          nextRunAt: Date.now() + (waitForNetwork ? 0 : backoff(attempts)),
          lastError: reason,
          updatedAt: Date.now(),
        });
        await db.meetings.update(job.meetingId, { aiStatus: failed ? 'failed' : 'pending', status: failed ? 'failed' : 'processing' });
        streaming.delete(job.meetingId);
        emit();
        if (waitForNetwork) return;
      }
    }
  };
  const locked = navigator.locks ? navigator.locks.request('ai-jobs', { ifAvailable: true }, (lock) => (lock ? work() : undefined)) : work();
  running = Promise.resolve(locked).finally(() => {
    running = null;
    void scheduleNext();
  });
  return running;
}

/** Reasons that mean "wait for the connection", not "the service failed". */
export const isNetworkWait = (reason?: string) => reason === 'offline' || reason === 'offline-only';

let timer: ReturnType<typeof setTimeout> | undefined;

/** Wakes the runner when the next backed-off job is due, so retries happen without a reload. */
async function scheduleNext() {
  clearTimeout(timer);
  const next = await db.aiJobs.where('status').equals('queued').sortBy('nextRunAt');
  const due = next.find((j) => !isNetworkWait(j.lastError));
  if (due) timer = setTimeout(() => void runAiJobs(), Math.max(1000, due.nextRunAt - Date.now()));
}

/** The summary job for a meeting, for showing why it's waiting. */
export function summaryJob(meetingId: string) {
  return db.aiJobs.where('[meetingId+kind]').equals([meetingId, 'summary']).first();
}

export async function retryMeetingSummary(meetingId: string): Promise<void> {
  await enqueueAiJob(meetingId, 'summary');
}
