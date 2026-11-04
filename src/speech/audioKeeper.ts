import { db } from '../db/schema';
import { uuidv7 } from '../db/ids';
import { tapAudio } from './audioTap';
import { SAMPLE_RATE } from './whisper/protocol';

/** Audio is written in pieces of this many seconds, so a crash loses at most this much. */
const CHUNK_S = 5;
/** Past this (about 3 hours, ~350 MB) the rest of the meeting keeps only its live transcript. */
const MAX_S = 3 * 60 * 60;

export function toInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.max(-1, Math.min(1, f[i]!)) * 0x7fff;
  return out;
}

export function toFloat32(i: Int16Array): Float32Array {
  const out = new Float32Array(i.length);
  for (let k = 0; k < i.length; k++) out[k] = i[k]! / 0x7fff;
  return out;
}

/**
 * Keeps the meeting's audio on this device (16 kHz mono, 16-bit) for the after-meeting clean-up
 * pass. Uses its own raw microphone stream: the browser's noise suppression hurts Whisper.
 * Returns a function that stops and writes what is left.
 */
export async function keepMeetingAudio(meetingId: string, elapsed: () => number): Promise<() => Promise<void>> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  const ctx = new AudioContext();
  const size = CHUNK_S * SAMPLE_RATE;
  let buf = new Float32Array(size);
  let fill = 0;
  let seq = 0;
  let total = 0;
  let firstAtMs: number | null = null;
  let writes = Promise.resolve();

  const write = () => {
    if (!fill || firstAtMs === null) return;
    const pcm = toInt16(buf.subarray(0, fill)).buffer as ArrayBuffer;
    const row = { id: uuidv7(), meetingId, seq: seq++, pcm, atMs: firstAtMs + ((total - fill) / SAMPLE_RATE) * 1000 };
    writes = writes.then(() => db.audio.add(row)).then(() => undefined, () => undefined); // full disk: the live transcript still stands
    buf = new Float32Array(size);
    fill = 0;
  };

  const untap = await tapAudio(ctx, ctx.createMediaStreamSource(stream), (frame) => {
    if (total >= MAX_S * SAMPLE_RATE) return;
    firstAtMs ??= Math.max(0, elapsed() - (frame.length / SAMPLE_RATE) * 1000);
    let at = 0;
    while (at < frame.length) {
      const n = Math.min(frame.length - at, size - fill);
      buf.set(frame.subarray(at, at + n), fill);
      fill += n;
      total += n;
      at += n;
      if (fill === size) write();
    }
  });

  return async () => {
    untap();
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close().catch(() => {});
    write();
    await writes;
  };
}
