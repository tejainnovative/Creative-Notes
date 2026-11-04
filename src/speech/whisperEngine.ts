import { getSettings } from '../data/settings';
import { tapAudio } from './audioTap';
import { SAMPLE_RATE, loadWhisper, transcribe, whisperLanguage, type ModelKey } from './whisper';
export { resample } from './audioTap';
import type { EngineHandlers, SpeechEngine } from './types';

const rms = (a: Float32Array) => {
  let s = 0;
  for (const v of a) s += v * v;
  return Math.sqrt(s / (a.length || 1));
};

/** Splits a stream of 16 kHz frames into speech chunks at pauses. Pure, so it can be unit-tested. */
export class Chunker {
  private buf: Float32Array[] = [];
  private len = 0;
  private silentMs = 0;
  private voicedMs = 0;
  private noise = 0.004;
  private startedAt = 0;
  /** Audio from just before speech starts, so the first syllable isn't clipped. */
  private preroll: { frame: Float32Array; atMs: number }[] = [];

  /**
   * minMs matters for accuracy: Whisper needs context, and people pause mid-sentence
   * ("ask not … what your country"), so a pause only ends a chunk once it's a few seconds long.
   */
  constructor(
    private onChunk: (audio: Float32Array, startMs: number, endMs: number) => void,
    private opts = { pauseMs: 700, minMs: 4000, maxMs: 15_000, prerollMs: 300 },
  ) {}

  /** `atMs` is the meeting clock at the start of this frame. */
  push(frame: Float32Array, atMs: number) {
    const ms = (frame.length / SAMPLE_RATE) * 1000;
    const level = rms(frame);
    // Track the background level slowly; speech is anything clearly above it.
    if (level < this.noise * 2) this.noise = this.noise * 0.98 + level * 0.02;
    const voiced = level > Math.max(0.01, this.noise * 3);

    if (!this.len && !voiced) {
      // Waiting for speech: keep a short rolling window to prepend when it starts.
      this.preroll.push({ frame, atMs });
      while (this.preroll.length > 1 && (this.preroll.length - 1) * ms > this.opts.prerollMs) this.preroll.shift();
      return;
    }
    if (!this.len) {
      this.startedAt = this.preroll[0]?.atMs ?? atMs;
      for (const p of this.preroll) this.buf.push(p.frame), (this.len += p.frame.length);
      this.preroll = [];
    }
    this.buf.push(frame);
    this.len += frame.length;
    if (voiced) (this.voicedMs += ms), (this.silentMs = 0);
    else this.silentMs += ms;

    const total = (this.len / SAMPLE_RATE) * 1000;
    if ((this.silentMs >= this.opts.pauseMs && total >= this.opts.minMs) || total >= this.opts.maxMs) this.flush(atMs + ms);
  }

  flush(endMs: number) {
    if (this.len && this.voicedMs >= 300) {
      const audio = new Float32Array(this.len);
      let o = 0;
      for (const f of this.buf) audio.set(f, o), (o += f.length);
      this.onChunk(audio, this.startedAt, endMs);
    }
    this.buf = [];
    this.len = 0;
    this.silentMs = 0;
    this.voicedMs = 0;
  }
}

/**
 * On-device transcription with Whisper. Text arrives a chunk at a time, a second or two after
 * each pause; nothing leaves the device. No speaker labels.
 */
export function createWhisperEngine(): SpeechEngine {
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let untap: (() => void) | null = null;
  let chunker: Chunker | null = null;
  let elapsedFn: () => number = () => 0;
  let busy = 0;
  let queue = Promise.resolve();

  return {
    id: 'whisper',
    where: 'device',
    async start(h: EngineHandlers, { language, elapsed }) {
      elapsedFn = elapsed;
      const model = ((await getSettings()).offlineModelId ?? 'tiny') as ModelKey;
      await loadWhisper(model); // from cache; throws if the model isn't downloaded and we're offline
      // Raw audio: the browser's echo cancelling and noise suppression smear speech, and Whisper
      // copes with background noise better than with that processing.
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      ctx = new AudioContext();
      const lang = whisperLanguage(language);

      chunker = new Chunker((audio, startMs, endMs) => {
        busy++;
        h.onPartial('…');
        queue = queue
          .then(() => transcribe(audio, lang))
          .then(({ text }) => {
            if (text) h.onFinal({ text, startMs, endMs });
          })
          .catch(() => h.onError('transcribe'))
          .finally(() => {
            busy--;
            if (!busy) h.onPartial('');
          });
      });

      untap = await tapAudio(ctx, ctx.createMediaStreamSource(stream), (frame) => chunker?.push(frame, elapsedFn()));
    },
    async stop() {
      chunker?.flush(elapsedFn());
      chunker = null;
      untap?.();
      stream?.getTracks().forEach((t) => t.stop());
      await ctx?.close().catch(() => {});
      await queue; // let the last chunk finish so its words are saved
      untap = null;
      stream = null;
      ctx = null;
    },
  };
}
