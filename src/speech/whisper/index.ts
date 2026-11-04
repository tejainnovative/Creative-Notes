import { MODELS, type FromWorker, type ModelKey, type TimedText, type ToWorker } from './protocol';

export { MODELS, SAMPLE_RATE, type ModelKey, type TimedText } from './protocol';

export interface LoadProgress {
  loaded: number;
  total: number;
}

export interface TranscribeResult {
  text: string;
  chunks?: TimedText[];
}

let worker: Worker | null = null;
let ready: { model: ModelKey; promise: Promise<void> } | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: TranscribeResult) => void; reject: (e: Error) => void }>();
const progressListeners = new Set<(p: LoadProgress) => void>();
const files = new Map<string, { loaded: number; total: number }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === 'progress') {
      files.set(m.file, { loaded: m.loaded, total: m.total });
      const sum = [...files.values()].reduce((a, f) => ({ loaded: a.loaded + f.loaded, total: a.total + f.total }), { loaded: 0, total: 0 });
      for (const fn of progressListeners) fn(sum);
    } else if (m.type === 'result') {
      pending.get(m.id)?.resolve({ text: m.text, chunks: m.chunks });
      pending.delete(m.id);
    } else if (m.type === 'error' && m.id !== undefined) {
      pending.get(m.id)?.reject(new Error(m.message));
      pending.delete(m.id);
    }
  };
  return worker;
}

function stopWorker() {
  worker?.terminate();
  worker = null;
  ready = null;
  files.clear();
  for (const p of pending.values()) p.reject(new Error('model unloaded'));
  pending.clear();
}

const send = (m: ToWorker, transfer: Transferable[] = []) => getWorker().postMessage(m, transfer);

/**
 * Loads a model, downloading it the first time (cached afterwards). Switching to a different
 * model restarts the worker so only one model sits in memory.
 */
export function loadWhisper(model: ModelKey, onProgress?: (p: LoadProgress) => void): Promise<void> {
  if (ready && ready.model !== model) stopWorker();
  if (onProgress) progressListeners.add(onProgress);
  if (!ready) {
    const promise = new Promise<void>((resolve, reject) => {
      const w = getWorker();
      const onMsg = (e: MessageEvent<FromWorker>) => {
        if (e.data.type === 'ready') {
          w.removeEventListener('message', onMsg);
          resolve();
        } else if (e.data.type === 'error' && e.data.id === undefined) {
          w.removeEventListener('message', onMsg);
          ready = null;
          reject(new Error(e.data.message));
        }
      };
      w.addEventListener('message', onMsg);
      send({ type: 'load', model });
    });
    ready = { model, promise };
  }
  return ready.promise.finally(() => onProgress && progressListeners.delete(onProgress));
}

/** Transcribes 16 kHz mono audio with the loaded model. Queued in order inside the worker. */
export function transcribe(audio: Float32Array, language?: string, opts: { timestamps?: boolean } = {}): Promise<TranscribeResult> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ type: 'transcribe', id, audio, language, timestamps: opts.timestamps }, [audio.buffer]);
  });
}

/** Removes every downloaded speech model and the runtime from this device. */
export async function deleteWhisper(): Promise<void> {
  stopWorker();
  if ('caches' in window) {
    for (const key of await caches.keys()) if (key.includes('transformers') || key === 'ort-runtime') await caches.delete(key);
  }
}

/** True if the model's files are in the cache (so it will load offline). */
export async function whisperCached(model: ModelKey): Promise<boolean> {
  if (!('caches' in window)) return false;
  for (const key of await caches.keys()) {
    if (!key.includes('transformers')) continue;
    const hits = await (await caches.open(key)).keys();
    if (hits.some((r) => r.url.includes(MODELS[model].revision) && r.url.includes('decoder_model_merged'))) return true;
  }
  return false;
}

/**
 * The language to give Whisper. "Detect automatically" uses the device's language: Whisper's own
 * detection runs separately on every few seconds of audio and can flip mid-meeting.
 */
export function whisperLanguage(setting: string): string {
  const tag = setting === 'auto' ? navigator.language || 'en' : setting;
  return tag.split('-')[0]!.toLowerCase();
}
