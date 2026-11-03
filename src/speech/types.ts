export type EngineId = 'cloud' | 'browser' | 'whisper' | 'demo';

export interface FinalSegment {
  text: string;
  speaker?: string;
  startMs: number;
  endMs: number;
}

export interface EngineHandlers {
  onPartial: (text: string) => void;
  onFinal: (seg: FinalSegment) => void;
  /** 'network' and 'no-speech' are recoverable; the recorder decides what to show. */
  onError: (code: string) => void;
}

/**
 * One transcription engine. Every engine emits the same events, so screens never care
 * which one is listening. `elapsed` gives the engine the meeting clock for timestamps.
 */
export interface SpeechEngine {
  readonly id: EngineId;
  /** Shown in the recording badge: does audio leave the device? */
  readonly where: 'cloud' | 'device';
  start(handlers: EngineHandlers, opts: { language: string; elapsed: () => number }): Promise<void>;
  stop(): Promise<void>;
}
