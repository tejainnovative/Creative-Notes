/** The offline speech model. Pinned to a commit so the files never change under us. */
export const MODEL = {
  id: 'onnx-community/whisper-tiny',
  revision: 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7',
  /**
   * Approximate download: full-precision encoder (33 MB), 8-bit decoder (31 MB), tokenizer (3 MB),
   * plus the 14 MB runtime. The 8-bit encoder saves 23 MB but gets common words wrong
   * ("ask" -> "as", "your" -> "you are") in testing, so accuracy wins.
   */
  approxBytes: 80 * 1024 * 1024,
} as const;

export const SAMPLE_RATE = 16_000;

export type ToWorker =
  | { type: 'load' }
  | { type: 'transcribe'; id: number; audio: Float32Array; language?: string };

export type FromWorker =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id?: number; message: string };
