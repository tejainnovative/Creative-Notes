import type { EngineHandlers, SpeechEngine } from './types';

// The Web Speech API is still prefixed in Chrome and Safari and missing from TypeScript's DOM types.
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const browserSpeechSupported = () => !!ctor();

/**
 * Live transcription with the browser's own speech service. In Chrome and Edge the audio goes
 * to the browser maker's servers, so it counts as a cloud engine and is never used in offline-only mode.
 * Chrome ends recognition after a silence; we restart it until stop() is called.
 */
export function createBrowserEngine(): SpeechEngine {
  let rec: Recognition | null = null;
  let active = false;
  let segStart = 0;

  return {
    id: 'browser',
    where: 'cloud',
    async start(h: EngineHandlers, { language, elapsed }) {
      const Ctor = ctor();
      if (!Ctor) throw new Error('unsupported');
      active = true;
      const begin = () => {
        rec = new Ctor();
        rec.lang = language === 'auto' ? navigator.language : language;
        rec.continuous = true;
        rec.interimResults = true;
        segStart = elapsed();
        rec.onresult = (e) => {
          let partial = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i]!;
            const text = r[0].transcript.trim();
            if (!text) continue;
            if (r.isFinal) {
              const now = elapsed();
              h.onFinal({ text: text.charAt(0).toUpperCase() + text.slice(1), startMs: segStart, endMs: now });
              segStart = now;
            } else partial += `${text} `;
          }
          h.onPartial(partial.trim());
        };
        rec.onerror = (e) => {
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') active = false;
          if (e.error !== 'no-speech' && e.error !== 'aborted') h.onError(e.error);
        };
        rec.onend = () => {
          h.onPartial('');
          if (active) begin();
        };
        rec.start();
      };
      begin();
    },
    async stop() {
      active = false;
      rec?.stop();
      rec = null;
    },
  };
}
