import { SAMPLE_RATE } from './whisper/protocol';

// The worklet just forwards raw frames; all the logic stays on the main thread where it's testable.
const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('cn-tap', Tap);
`;

/** Linear resample to 16 kHz mono. */
export function resample(input: Float32Array, from: number): Float32Array {
  if (from === SAMPLE_RATE) return input;
  const ratio = from / SAMPLE_RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, input.length - 1);
    out[i] = input[i0]! + (input[i1]! - input[i0]!) * (x - i0);
  }
  return out;
}

/**
 * Streams a microphone source as 16 kHz mono Float32 frames. Returns a function that
 * disconnects the tap (the caller owns the AudioContext and the stream).
 */
export async function tapAudio(ctx: AudioContext, source: MediaStreamAudioSourceNode, onFrame: (frame: Float32Array) => void): Promise<() => void> {
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const node = new AudioWorkletNode(ctx, 'cn-tap');
  source.connect(node);
  const rate = ctx.sampleRate;
  node.port.onmessage = (e: MessageEvent<Float32Array>) => onFrame(resample(e.data, rate));
  return () => {
    node.port.onmessage = null;
    node.disconnect();
  };
}
