import { useEffect, useRef, useState } from 'react';
import { getSettings } from '../data/settings';
import { browserSpeechSupported, createBrowserEngine } from './browserEngine';
import { createDemoEngine } from './demoEngine';
import { createWhisperEngine } from './whisperEngine';
import { recorder } from './recorder';
import type { SpeechEngine } from './types';

export type DictationState = 'idle' | 'starting' | 'listening' | 'stopping';

/** Why the mic can't be used right now, in words for the screen. */
export type DictationProblem = 'recording' | 'no-engine' | 'mic-denied' | 'failed';

export const DICTATION_PROBLEMS: Record<DictationProblem, string> = {
  recording: 'A meeting is recording. Stop it first to dictate a note.',
  'no-engine': "You're offline and the speech model isn't downloaded. Get it in Settings → Offline transcription, or type instead.",
  'mic-denied': 'The microphone is blocked. Allow it in your browser settings to dictate.',
  failed: "Dictation didn't start. Try again, or type instead.",
};

function forcedEngine(): string | null {
  try {
    return import.meta.env.DEV ? localStorage.getItem('cn:engine') : null;
  } catch {
    return null;
  }
}

/** The same order as meetings: the browser's speech service online, Whisper on the device offline. */
async function pickEngine(): Promise<SpeechEngine | null> {
  const forced = forcedEngine();
  if (forced === 'demo') return createDemoEngine(600);
  if (forced === 'silent') return createDemoEngine(10 * 60_000);
  const s = await getSettings();
  const mayUseCloud = s.connectivityMode !== 'offline_only' && navigator.onLine;
  if (s.offlineModel === 'ready' && (s.speechEngine === 'device' || !mayUseCloud)) return createWhisperEngine();
  if (mayUseCloud && browserSpeechSupported()) return createBrowserEngine();
  return null;
}

/**
 * Speech to text for a text box. Each finished phrase goes to `onText`; the words still being
 * heard are in `partial`. Speaker names are left out: this is one person dictating.
 */
export function useDictation(onText: (text: string) => void) {
  const [state, setState] = useState<DictationState>('idle');
  const [partial, setPartial] = useState('');
  const [problem, setProblem] = useState<DictationProblem | null>(null);
  const engine = useRef<SpeechEngine | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  async function start() {
    if (state !== 'idle') return;
    setProblem(null);
    if (recorder.get().status !== 'idle') return setProblem('recording');
    setState('starting');
    const e = await pickEngine();
    if (!e) {
      setState('idle');
      return setProblem('no-engine');
    }
    engine.current = e;
    const began = Date.now();
    try {
      const s = await getSettings();
      await e.start(
        {
          onPartial: (p) => setPartial(p === '…' ? '' : p),
          onFinal: (seg) => {
            setPartial('');
            onTextRef.current(seg.text);
          },
          onError: (code) => {
            if (code === 'not-allowed' || code === 'service-not-allowed') {
              setProblem('mic-denied');
              void stop();
            }
          },
        },
        { language: s.language, elapsed: () => Date.now() - began },
      );
      setState('listening');
    } catch (err) {
      engine.current = null;
      setState('idle');
      setProblem(err instanceof DOMException && err.name === 'NotAllowedError' ? 'mic-denied' : 'failed');
    }
  }

  async function stop() {
    const e = engine.current;
    if (!e) return;
    setState('stopping');
    await e.stop().catch(() => {});
    engine.current = null;
    setPartial('');
    setState('idle');
  }

  // Never leave the microphone on when the screen goes away.
  useEffect(() => () => void engine.current?.stop(), []);

  return { state, partial, problem, start, stop, toggle: () => (state === 'idle' ? start() : stop()) };
}
