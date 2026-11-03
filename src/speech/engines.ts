import type { ConnectivityMode } from '../data/settings';
import { browserSpeechSupported, createBrowserEngine } from './browserEngine';
import { createDeepgramEngine } from './deepgramEngine';
import { createDemoEngine } from './demoEngine';
import { createWhisperEngine } from './whisperEngine';
import type { SpeechEngine } from './types';

export type EngineNotice =
  /** Offline or offline-only, and the on-device model hasn't been downloaded. */
  | 'device-model-missing'
  /** The on-device model is downloaded but failed to start. */
  | 'device-model-failed'
  /** Online, but this browser has no live speech recognition (Firefox, some in-app browsers). */
  | 'no-browser-speech'
  /** Cloud speech failed to start; fell back to the browser's own service. */
  | 'cloud-fallback';

/** Dev and tests only: localStorage 'cn:engine' = 'demo' forces the scripted engine, 'silent' one that hears nothing. */
function forcedEngine(): string | null {
  try {
    return localStorage.getItem('cn:engine');
  } catch {
    return null;
  }
}

export interface EngineChoice {
  engine: SpeechEngine;
  notice?: EngineNotice;
  /** Next engine to try if this one fails to start. */
  fallback?: () => EngineChoice;
}

function browserOrDemo(notice?: EngineNotice): EngineChoice {
  if (browserSpeechSupported()) return { engine: createBrowserEngine(), notice };
  return { engine: createDemoEngine(), notice: 'no-browser-speech' };
}

/**
 * Picks the transcription engine for a new meeting, in this order:
 *   online + paired server with speech: cloud STT with speaker labels (Deepgram)
 *   online otherwise: the browser's speech service
 *   offline / offline-only: on-device Whisper once downloaded (S13), else a labelled demo transcript
 */
export function chooseEngine({ mode, online, cloudSpeech, deviceModel }: { mode: ConnectivityMode; online: boolean; cloudSpeech: boolean; deviceModel: boolean }): EngineChoice {
  if (import.meta.env.DEV) {
    const forced = forcedEngine();
    if (forced === 'demo') return { engine: createDemoEngine(900) };
    if (forced === 'silent') return { engine: createDemoEngine(10 * 60_000) };
  }
  const mayUseCloud = mode !== 'offline_only' && online;
  if (!mayUseCloud) {
    if (deviceModel) return { engine: createWhisperEngine(), fallback: () => ({ engine: createDemoEngine(), notice: 'device-model-failed' }) };
    return { engine: createDemoEngine(), notice: 'device-model-missing' };
  }
  if (cloudSpeech) return { engine: createDeepgramEngine(), fallback: () => browserOrDemo('cloud-fallback') };
  return browserOrDemo();
}
