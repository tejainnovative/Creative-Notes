import { MODEL, type FromWorker, type ToWorker } from './protocol';

export { MODEL, SAMPLE_RATE } from './protocol';

export interface LoadProgress {
  loaded: number;
  total: number;
}

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();
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
      pending.get(m.id)?.resolve(m.text);
      pending.delete(m.id);
    } else if (m.type === 'error' && m.id !== undefined) {
      pending.get(m.id)?.reject(new Error(m.message));
      pending.delete(m.id);
    }
  };
  return worker;
}

const send = (m: ToWorker, transfer: Transferable[] = []) => getWorker().postMessage(m, transfer);

/**
 * Loads the model, downloading it the first time (cached afterwards).
 * Resolves when it can transcribe; rejects if the download fails.
 */
export function loadWhisper(onProgress?: (p: LoadProgress) => void): Promise<void> {
  if (onProgress) progressListeners.add(onProgress);
  ready ??= new Promise<void>((resolve, reject) => {
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
    send({ type: 'load' });
  });
  return ready.finally(() => onProgress && progressListeners.delete(onProgress));
}

/** Transcribes 16 kHz mono audio. Queued in order inside the worker. */
export function transcribe(audio: Float32Array, language?: string): Promise<string> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ type: 'transcribe', id, audio, language }, [audio.buffer]);
  });
}

/** Removes the downloaded model and runtime from this device. */
export async function deleteWhisper(): Promise<void> {
  worker?.terminate();
  worker = null;
  ready = null;
  files.clear();
  for (const p of pending.values()) p.reject(new Error('model removed'));
  pending.clear();
  if ('caches' in window) {
    for (const key of await caches.keys()) if (key.includes('transformers') || key === 'ort-runtime') await caches.delete(key);
  }
}

/** True if the model files are in the cache (so it will load offline). */
export async function whisperCached(): Promise<boolean> {
  if (!('caches' in window)) return false;
  for (const key of await caches.keys()) {
    if (!key.includes('transformers')) continue;
    const hits = await (await caches.open(key)).keys();
    if (hits.some((r) => r.url.includes(MODEL.revision) && r.url.includes('decoder_model_merged'))) return true;
  }
  return false;
}
