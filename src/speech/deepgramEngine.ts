import { apiFetch } from '../net/api';
import type { EngineHandlers, SpeechEngine } from './types';

interface DeepgramResult {
  type: 'Results';
  start: number;
  duration: number;
  is_final: boolean;
  channel: { alternatives: { transcript: string; words?: { speaker?: number }[] }[] };
}

function pickMime(): string | undefined {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'])
    if (MediaRecorder.isTypeSupported(m)) return m;
  return undefined;
}

/** Most common speaker number across a result's words, as "Speaker 1", "Speaker 2"... */
function speakerOf(words: { speaker?: number }[] = []): string | undefined {
  const counts = new Map<number, number>();
  for (const w of words) if (w.speaker !== undefined) counts.set(w.speaker, (counts.get(w.speaker) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? `Speaker ${top[0] + 1}` : undefined;
}

/**
 * Cloud transcription with speaker labels (Deepgram streaming).
 * Audio goes from the device straight to Deepgram, authorised by a one-minute token from our
 * server; the API key never reaches the browser. If the socket drops, it reconnects with a new token.
 *
 * NOT YET VERIFIED against the live service (needs a DEEPGRAM_API_KEY): the browser sends the
 * token as the 'bearer' WebSocket subprotocol, because browsers can't set an Authorization header.
 */
export function createDeepgramEngine(): SpeechEngine {
  let active = false;
  let ws: WebSocket | null = null;
  let rec: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let keepAlive: ReturnType<typeof setInterval> | undefined;

  async function connect(h: EngineHandlers, language: string, elapsed: () => number): Promise<void> {
    const { token, url } = (await (await apiFetch('/stt/token', { body: { language } })).json()) as { token: string; url: string };
    const offset = elapsed(); // Deepgram times are relative to this socket
    const socket = new WebSocket(url, ['bearer', token]);
    ws = socket;
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('socket'));
    });
    socket.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as DeepgramResult | { type: string };
      if (msg.type !== 'Results') return;
      const r = msg as DeepgramResult;
      const alt = r.channel.alternatives[0];
      const text = alt?.transcript.trim();
      if (!text) return;
      if (r.is_final) {
        h.onPartial('');
        h.onFinal({ text, speaker: speakerOf(alt?.words), startMs: offset + r.start * 1000, endMs: offset + (r.start + r.duration) * 1000 });
      } else h.onPartial(text);
    };
    socket.onclose = () => {
      if (!active) return;
      h.onError('network');
      setTimeout(() => active && void connect(h, language, elapsed).catch(() => h.onError('network')), 2000);
    };
  }

  return {
    id: 'cloud',
    where: 'cloud',
    async start(h, { language, elapsed }) {
      active = true;
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      await connect(h, language, elapsed);
      rec = new MediaRecorder(stream, { mimeType: pickMime() });
      rec.ondataavailable = (e) => {
        if (e.data.size && ws?.readyState === WebSocket.OPEN) ws.send(e.data);
      };
      rec.start(250);
      keepAlive = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'KeepAlive' })), 8000);
    },
    async stop() {
      active = false;
      clearInterval(keepAlive);
      if (rec?.state !== 'inactive') rec?.stop();
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'CloseStream' }));
        await new Promise((r) => setTimeout(r, 800)); // let the last final result arrive
      }
      ws?.close();
      stream?.getTracks().forEach((t) => t.stop());
      ws = null;
      rec = null;
      stream = null;
    },
  };
}
