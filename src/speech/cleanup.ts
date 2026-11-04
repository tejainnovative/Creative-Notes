import { useSyncExternalStore } from 'react';
import { db, type Segment } from '../db/schema';
import { uuidv7 } from '../db/ids';
import { getSettings } from '../data/settings';
import { enqueueAiJob } from '../data/jobs';
import { searchIndex } from '../data/search';
import { toFloat32 } from './audioKeeper';
import { loadWhisper, transcribe, whisperLanguage, SAMPLE_RATE, type ModelKey } from './whisper';

/**
 * The after-meeting clean-up pass. Live transcription hears a few seconds at a time and guesses;
 * this re-reads the whole meeting in ~30 s windows (Whisper's native size), cut at quiet moments
 * so no word is split, and replaces the live transcript. Then the audio is deleted and the summary
 * is queued. It pauses while a new recording runs and resumes after, or on the next app start.
 */

const WINDOW_S = 28;
/** Look for the quietest 100 ms in the last this-many seconds of a window to cut at. */
const CUT_SEARCH_S = 8;
/** A window quieter than this (RMS) is silence: Whisper invents words for silence, so skip it. */
const SILENCE_RMS = 0.004;

// Progress per meeting (0..1) for the screens.
const progress = new Map<string, number>();
const listeners = new Set<() => void>();
function setProgress(id: string, p: number | undefined) {
  if (p === undefined) progress.delete(id);
  else progress.set(id, p);
  for (const fn of listeners) fn();
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** How far the clean-up of a meeting has got, 0..1, or undefined when it isn't running. */
export function useCleanup(meetingId: string): number | undefined {
  return useSyncExternalStore(subscribe, () => progress.get(meetingId));
}

let paused = false;
let running: Promise<void> | null = null;
class Paused extends Error {}

/** The recorder pauses clean-up while recording: both need the speech model and the CPU. */
export function pauseCleanup(on: boolean) {
  paused = on;
}

function rms(a: Float32Array, from = 0, to = a.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i]! * a[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
}

/** Index of the quietest 100 ms stretch in the last CUT_SEARCH_S seconds, to end a window there. */
export function quietCut(a: Float32Array): number {
  const step = SAMPLE_RATE / 10;
  let best = a.length;
  let bestRms = Infinity;
  for (let at = Math.max(step, a.length - CUT_SEARCH_S * SAMPLE_RATE); at + step <= a.length; at += step / 2) {
    const r = rms(a, at, at + step);
    if (r < bestRms) {
      bestRms = r;
      best = at + step / 2;
    }
  }
  return Math.floor(best);
}

/** Joins Whisper's short timed phrases into sentence-sized transcript lines. */
export function toLines(phrases: { text: string; startMs: number; endMs: number }[]): { text: string; startMs: number; endMs: number }[] {
  const out: { text: string; startMs: number; endMs: number }[] = [];
  for (const p of phrases) {
    const last = out[out.length - 1];
    if (last && !/[.?!]$/.test(last.text) && last.text.length + p.text.length < 240 && p.startMs - last.endMs < 1500) {
      last.text = `${last.text} ${p.text}`;
      last.endMs = p.endMs;
    } else out.push({ ...p });
  }
  return out;
}

async function transcribeMeeting(meetingId: string, model: ModelKey, language: string): Promise<{ text: string; startMs: number; endMs: number }[] | null> {
  const keys = (await db.audio.where('[meetingId+seq]').between([meetingId, -Infinity], [meetingId, Infinity]).primaryKeys()) as string[];
  if (!keys.length) return null;
  await loadWhisper(model);
  const lang = whisperLanguage(language);
  const phrases: { text: string; startMs: number; endMs: number }[] = [];
  let win = new Float32Array(0);
  let winAtMs = 0;

  const run = async (audio: Float32Array, atMs: number) => {
    if (paused) throw new Paused();
    if (audio.length < SAMPLE_RATE / 2 || rms(audio) < SILENCE_RMS) return;
    const durMs = (audio.length / SAMPLE_RATE) * 1000;
    const { text, chunks } = await transcribe(audio.slice(), lang, { timestamps: true });
    if (chunks?.length) {
      for (const c of chunks) phrases.push({ text: c.text, startMs: Math.round(atMs + c.start * 1000), endMs: Math.round(atMs + Math.min(c.end * 1000, durMs)) });
    } else if (text) phrases.push({ text, startMs: Math.round(atMs), endMs: Math.round(atMs + durMs) });
  };

  for (let k = 0; k < keys.length; k++) {
    const chunk = await db.audio.get(keys[k]!);
    if (!chunk) continue;
    const pcm = toFloat32(new Int16Array(chunk.pcm));
    const expected = winAtMs + (win.length / SAMPLE_RATE) * 1000;
    if (win.length && Math.abs(chunk.atMs - expected) > 500) {
      // A gap in the audio: finish what we have before jumping ahead.
      await run(win, winAtMs);
      win = new Float32Array(0);
    }
    if (!win.length) winAtMs = chunk.atMs;
    const joined = new Float32Array(win.length + pcm.length);
    joined.set(win);
    joined.set(pcm, win.length);
    win = joined;
    while (win.length >= WINDOW_S * SAMPLE_RATE) {
      const cut = quietCut(win.subarray(0, WINDOW_S * SAMPLE_RATE));
      await run(win.subarray(0, cut), winAtMs);
      winAtMs += (cut / SAMPLE_RATE) * 1000;
      win = win.slice(cut);
    }
    setProgress(meetingId, (k + 1) / keys.length);
  }
  await run(win, winAtMs);
  return toLines(phrases);
}

/** Deletes the audio and moves the meeting on to its summary (or to done if nothing was said). */
async function finish(meetingId: string) {
  await db.audio.where('meetingId').equals(meetingId).delete();
  setProgress(meetingId, undefined);
  const meeting = await db.meetings.get(meetingId);
  if (!meeting) return;
  if (await db.segments.where('meetingId').equals(meetingId).count()) await enqueueAiJob(meetingId, 'summary');
  else await db.meetings.update(meetingId, { status: 'done', aiStatus: 'done', updatedAt: Date.now() });
  void searchIndex.refreshMeeting(meetingId);
}

async function cleanupMeeting(meetingId: string) {
  const meeting = await db.meetings.get(meetingId);
  if (!meeting) return void (await db.audio.where('meetingId').equals(meetingId).delete());
  if (meeting.status === 'recording') return;
  const s = await getSettings();
  const segments = await db.segments.where('meetingId').equals(meetingId).toArray();
  // Cloud transcripts with speaker names are kept: Whisper can't tell speakers apart.
  const canImprove = s.offlineModel === 'ready' && s.cleanupAfterRecording && !segments.some((x) => x.speaker);
  if (canImprove) {
    setProgress(meetingId, 0);
    let lines: Awaited<ReturnType<typeof transcribeMeeting>> = null;
    try {
      lines = await transcribeMeeting(meetingId, s.offlineModelId, meeting.language ?? s.language);
    } catch (err) {
      setProgress(meetingId, undefined);
      if (err instanceof Paused) throw err;
      // The model couldn't load or run: keep the live transcript.
    }
    if (lines?.length) {
      await db.transaction('rw', db.meetings, db.segments, async () => {
        if (!(await db.meetings.get(meetingId))) return; // deleted meanwhile
        await db.segments.where('meetingId').equals(meetingId).delete();
        await db.segments.bulkAdd(lines!.map((l): Segment => ({ id: uuidv7(), meetingId, startMs: l.startMs, endMs: l.endMs, text: l.text, engine: 'whisper' })));
      });
    }
  }
  await finish(meetingId);
}

/** Cleans up every finished meeting that still has audio, one at a time. Safe to call often. */
export function runCleanups(): Promise<void> {
  running ??= (async () => {
    try {
      for (const id of (await db.audio.orderBy('meetingId').uniqueKeys()) as string[]) {
        if (paused) return;
        await cleanupMeeting(id);
      }
    } catch (err) {
      if (!(err instanceof Paused)) throw err;
    } finally {
      running = null;
    }
  })();
  return running;
}
