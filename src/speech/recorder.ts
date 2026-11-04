import { useSyncExternalStore } from 'react';
import { db } from '../db/schema';
import { appendSegment, deleteMeeting, endMeeting, setCaptureMode, startMeeting } from '../data/meetings';
import type { ConnectivityMode } from '../data/settings';
import { cloudSpeechReady } from '../net/api';
import { keepMeetingAudio } from './audioKeeper';
import { pauseCleanup, runCleanups } from './cleanup';
import { chooseEngine, type EngineNotice } from './engines';
import { micErrorFrom, openMicLevels, type MicError } from './micLevels';
import type { EngineId, FinalSegment, SpeechEngine } from './types';

export type RecorderStatus = 'idle' | 'starting' | 'recording' | 'reconnecting' | 'stopping';

export interface RecorderState {
  status: RecorderStatus;
  meetingId?: string;
  startedAt?: number;
  partial: string;
  levels: number[];
  engine?: { id: EngineId; where: 'cloud' | 'device' };
  notice?: EngineNotice;
  micError?: MicError | 'busy';
}

const BARS = 32;
let state: RecorderState = { status: 'idle', partial: '', levels: Array(BARS).fill(0) };
const listeners = new Set<() => void>();

function set(patch: Partial<RecorderState>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

let engine: SpeechEngine | null = null;
let closeMic: (() => void) | null = null;
let stopKeeping: (() => Promise<void>) | null = null;
let releaseLock: (() => void) | null = null;
let wakeLock: { release(): Promise<void> } | null = null;

/** Holds the 'recorder' Web Lock so two tabs can't record at once. Resolves false if another tab has it. */
function takeLock(): Promise<boolean> {
  if (!navigator.locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    void navigator.locks.request('recorder', { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      return new Promise<void>((release) => {
        releaseLock = release;
      });
    });
  });
}

async function keepScreenOn() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
    wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null; // not fatal: some browsers refuse without a gesture or on low battery
  }
}

export const recorder = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Starts a meeting. Returns the meeting id, or undefined with micError set. */
  async start({ mode, online, language, title, deviceModel = false, preferDevice = false, keepAudio = false }: { mode: ConnectivityMode; online: boolean; language: string; title?: string; deviceModel?: boolean; preferDevice?: boolean; keepAudio?: boolean }): Promise<string | undefined> {
    if (state.status !== 'idle') return state.meetingId;
    set({ status: 'starting', micError: undefined, notice: undefined, partial: '' });
    pauseCleanup(true);

    if (!(await takeLock())) {
      set({ status: 'idle', micError: 'busy' });
      return undefined;
    }
    try {
      closeMic = await openMicLevels(BARS, (levels) => set({ levels }));
    } catch (err) {
      releaseLock?.();
      pauseCleanup(false);
      set({ status: 'idle', micError: err instanceof DOMException && err.name === 'NotSupportedError' ? 'unsupported' : micErrorFrom(err) });
      return undefined;
    }

    let choice = chooseEngine({ mode, online, cloudSpeech: cloudSpeechReady(), deviceModel, preferDevice });
    const meeting = await startMeeting({ title, mode: choice.engine.where === 'cloud' ? 'online' : 'offline', language });
    const elapsed = () => Date.now() - meeting.startedAt;
    const handlers = {
      onPartial: (partial: string) => set({ partial, ...(state.status === 'reconnecting' && partial ? { status: 'recording' as const } : {}) }),
      onFinal: (seg: FinalSegment) => {
        if (state.status === 'reconnecting') set({ status: 'recording' });
        void appendSegment(meeting.id, { ...seg, engine: engine?.id ?? 'demo' });
      },
      onError: (code: string) => {
        if (code === 'network') set({ status: 'reconnecting' });
        if (code === 'not-allowed' || code === 'service-not-allowed') set({ micError: 'denied' });
      },
    };

    // Try the chosen engine; if it can't start (e.g. the speech service is down), fall back down the chain.
    for (;;) {
      engine = choice.engine;
      try {
        await engine.start(handlers, { language, elapsed });
        break;
      } catch {
        await engine.stop().catch(() => {});
        if (!choice.fallback) {
          engine = null;
          await deleteMeeting(meeting.id);
          await recorder.stop();
          set({ micError: 'other' });
          return undefined;
        }
        choice = choice.fallback();
      }
    }
    await setCaptureMode(meeting.id, engine.where === 'cloud' ? 'online' : 'offline');
    // Keep the audio for the clean-up pass. Not fatal: the live transcript works without it.
    if (keepAudio) stopKeeping = await keepMeetingAudio(meeting.id, elapsed).catch(() => null);
    set({
      status: 'recording',
      meetingId: meeting.id,
      startedAt: meeting.startedAt,
      engine: { id: engine.id, where: engine.where },
      notice: choice.notice,
    });
    void keepScreenOn();
    return meeting.id;
  },

  /** Stops, saves and queues the summary. Returns the meeting id. */
  async stop(): Promise<string | undefined> {
    const id = state.meetingId;
    if (state.status === 'starting' && !id) {
      // Failed during start: release what was opened, keep the meeting row out of History.
      closeMic?.();
      closeMic = null;
      releaseLock?.();
      releaseLock = null;
      pauseCleanup(false);
      set({ status: 'idle', partial: '', levels: Array(BARS).fill(0), engine: undefined });
      return undefined;
    }
    if (!id || state.status === 'stopping' || state.status === 'idle') return id;
    set({ status: 'stopping' });
    await engine?.stop();
    engine = null;
    await stopKeeping?.();
    stopKeeping = null;
    closeMic?.();
    closeMic = null;
    await wakeLock?.release().catch(() => {});
    wakeLock = null;
    await endMeeting(id);
    releaseLock?.();
    releaseLock = null;
    set({ status: 'idle', meetingId: undefined, startedAt: undefined, partial: '', levels: Array(BARS).fill(0), engine: undefined });
    pauseCleanup(false);
    void runCleanups().catch(() => {});
    return id;
  },

  clearError() {
    set({ micError: undefined });
  },
};

/**
 * A reload, crash or closed tab mid-recording leaves a meeting marked "recording" with nobody
 * recording it. On start-up, finish those meetings as of their last captured words so they get
 * a summary, unless another tab still holds the recorder lock (it's really recording).
 */
export async function recoverInterruptedMeetings(): Promise<number> {
  if (state.status !== 'idle') return 0;
  const stuck = await db.meetings.where('status').equals('recording').toArray();
  if (!stuck.length) return 0;
  if (navigator.locks?.query) {
    const { held = [] } = await navigator.locks.query();
    if (held.some((l) => l.name === 'recorder')) return 0;
  }
  for (const m of stuck) {
    const last = await db.segments.where('[meetingId+startMs]').between([m.id, -Infinity], [m.id, Infinity]).last();
    await endMeeting(m.id, m.startedAt + (last?.endMs ?? 0));
  }
  return stuck.length;
}

export function useRecorder(): RecorderState {
  return useSyncExternalStore(recorder.subscribe, recorder.get);
}
