export type MicError = 'denied' | 'no-device' | 'insecure' | 'unsupported' | 'other';

export function micErrorFrom(err: unknown): MicError {
  if (!window.isSecureContext) return 'insecure';
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-device';
  return 'other';
}

/**
 * Opens the microphone and reports a 0..1 level per bar, about 15 times a second.
 * This also proves we have mic permission before any engine starts.
 */
export async function openMicLevels(bars: number, onLevels: (levels: number[]) => void): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('unsupported', 'NotSupportedError');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  const history: number[] = Array(bars).fill(0);
  const timer = setInterval(() => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / data.length);
    history.push(Math.min(1, rms * 4));
    history.shift();
    onLevels([...history]);
  }, 66);
  return () => {
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };
}
