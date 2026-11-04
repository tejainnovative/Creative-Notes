/// <reference lib="webworker" />
// Runs Whisper (Transformers.js + ONNX Runtime, WASM) off the main thread.
// Model files come from the Hugging Face Hub at a pinned commit and are kept in the browser's
// Cache API, so after the first download everything works offline. The ONNX runtime files are
// served by this app (/ort/), not a third-party CDN.

import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { MODELS, type FromWorker, type ModelKey, type TimedText, type ToWorker } from './protocol';

env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) {
  // Pin the exact runtime files. Left alone, the library fetches its 26 MB "asyncify" build from a
  // public CDN. The plain SIMD build (14 MB) runs the WASM backend everywhere and fits hosting limits.
  const ort = `${import.meta.env.BASE_URL}ort/ort-wasm-simd-threaded`;
  env.backends.onnx.wasm.wasmPaths = { mjs: `${ort}.mjs`, wasm: `${ort}.wasm` };
  // Threads need cross-origin isolation; one thread works everywhere, including iPhone.
  env.backends.onnx.wasm.numThreads = 1;
}

const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let loaded: ModelKey | null = null;
let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function load(model: ModelKey): Promise<AutomaticSpeechRecognitionPipeline> {
  if (asr && loaded === model) return asr;
  const m = MODELS[model];
  loaded = model;
  // Bake the pinned commit into every Hub URL. `revision` alone isn't enough: the library's size
  // and file-list lookups ignore it and would read the moving `main` branch.
  env.remotePathTemplate = `{model}/resolve/${m.revision}/`;
  asr = (pipeline('automatic-speech-recognition', m.id, {
    revision: m.revision,
    device: 'wasm',
    // Full-precision encoder, 8-bit decoder: see MODELS for why.
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.file && p.total) post({ type: 'progress', file: p.file, loaded: p.loaded ?? 0, total: p.total });
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>).catch((err) => {
    asr = null; // let a later attempt retry (e.g. the connection came back)
    loaded = null;
    throw err;
  });
  return asr;
}

/**
 * Whisper's markers for silence and noise, and lone punctuation, are not speech.
 * Small Whisper models sometimes loop on a phrase; a phrase repeated 3+ times in a row is kept once.
 */
export function clean(text: string): string {
  let t = text.replace(/\[(BLANK_AUDIO|MUSIC|NOISE|SOUND)\]|\((music|silence|noise)\)/gi, '').trim();
  t = t.replace(/(\b.{8,80}?[,.!?]?\s+)(?:\1){2,}/gi, '$1').trim();
  return /^[\s.,!?…-]*$/.test(t) ? '' : t;
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      await load(m.model);
      post({ type: 'ready', model: m.model });
    } else if (m.type === 'transcribe') {
      if (!asr) throw new Error('model not loaded');
      const run = await asr;
      // Timestamps keep Whisper from ending early at a long mid-sentence pause, and give the
      // clean-up pass the timing of each phrase. ~30 s of speech is well under 224 tokens.
      const out = await run(m.audio, { language: m.language ?? undefined, task: 'transcribe', return_timestamps: true, max_new_tokens: 224 });
      const results = Array.isArray(out) ? out : [out];
      const text = clean(results.map((o) => o.text).join(' '));
      let chunks: TimedText[] | undefined;
      if (m.timestamps) {
        const audioSec = m.audio.length / 16_000;
        chunks = results
          .flatMap((o) => (o as { chunks?: { text: string; timestamp: [number, number | null] }[] }).chunks ?? [])
          .map((c) => ({ text: clean(c.text), start: c.timestamp[0], end: c.timestamp[1] ?? audioSec }))
          .filter((c) => c.text);
      }
      post({ type: 'result', id: m.id, text, chunks });
    }
  } catch (err) {
    post({ type: 'error', id: m.type === 'transcribe' ? m.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
