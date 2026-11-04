/**
 * The offline speech models. Each is pinned to a commit so the files never change under us.
 * Both use a full-precision encoder: the 8-bit encoder is smaller but got common words wrong in
 * testing ("ask" -> "as", "your" -> "you are"). Sizes include the 14 MB runtime.
 */
export const MODELS = {
  tiny: {
    id: 'onnx-community/whisper-tiny',
    revision: 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7',
    approxBytes: 80 * 1024 * 1024,
    label: 'Fast',
    blurb: 'Smallest download, quickest on older phones. Fine for clear speech from one person.',
  },
  base: {
    id: 'onnx-community/whisper-base',
    revision: '27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c',
    approxBytes: 153 * 1024 * 1024,
    label: 'More accurate',
    blurb: 'Noticeably fewer mistakes with accents, noise and several people. Recommended for meetings.',
  },
} as const;

export type ModelKey = keyof typeof MODELS;

export const SAMPLE_RATE = 16_000;

export interface TimedText {
  text: string;
  /** Seconds from the start of the audio sent. */
  start: number;
  end: number;
}

export type ToWorker =
  | { type: 'load'; model: ModelKey }
  | { type: 'transcribe'; id: number; audio: Float32Array; language?: string; timestamps?: boolean };

export type FromWorker =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready'; model: ModelKey }
  | { type: 'result'; id: number; text: string; chunks?: TimedText[] }
  | { type: 'error'; id?: number; message: string };
