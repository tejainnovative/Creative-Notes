import { apiFetch, ApiError } from '../net/api';
import { AiUnavailableError, type AiClient, type ChatResult, type SummaryResult } from './types';

/** Reads `event:` / `data:` blocks from a server-sent-events response body. */
async function* sseEvents(res: Response): AsyncGenerator<{ event: string; data: unknown }> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let cut: number;
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (data !== undefined) yield { event, data: JSON.parse(data) };
    }
  }
}

/** Server errors that mean "try again later" rather than "this request is wrong". */
const RETRYABLE = new Set(['upstream_busy', 'upstream_error', 'upstream_unreachable', 'rate_limited', 'daily_budget_reached', 'not_configured']);

async function call<T>(path: string, body: unknown, onDelta?: (t: string) => void, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, { body, signal });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 429 || err.status === 503 || err.status >= 500))
      throw new AiUnavailableError(err.code);
    if (err instanceof TypeError) throw new AiUnavailableError('unreachable'); // network failure
    throw err;
  }
  for await (const { event, data } of sseEvents(res)) {
    if (event === 'delta') onDelta?.((data as { text: string }).text);
    else if (event === 'final') return data as T;
    else if (event === 'error') {
      const code = (data as { error: string }).error;
      if (RETRYABLE.has(code)) throw new AiUnavailableError(code);
      throw new Error(code);
    }
  }
  throw new AiUnavailableError('stream_ended');
}

interface ServerSummary {
  overview: string;
  decisions: string[];
  action_items: { owner: string | null; text: string; due_text: string | null; priority: 1 | 2 | 3 }[];
  key_topics: { title: string; detail: string }[];
  insights: SummaryResult['insights'];
  model: string;
}

/** Claude through this app's server. Same interface as the preview, so no screen changes. */
export const httpAi: AiClient = {
  name: 'Claude',

  async summarize(input, onDelta, signal): Promise<SummaryResult> {
    const r = await call<ServerSummary>(
      '/ai/summary',
      {
        meeting_id: input.meetingId,
        language: input.language,
        segments: input.segments.map((s) => ({ speaker: s.speaker, text: s.text, start_ms: Math.round(s.startMs) })),
        manual_notes: input.manualNotes.map((n) => ({ text: n.text, at_ms: Math.round(n.atMs) })),
      },
      onDelta,
      signal,
    );
    return {
      overview: r.overview,
      decisions: r.decisions,
      actionItems: r.action_items.map((a) => ({ owner: a.owner ?? undefined, text: a.text, dueText: a.due_text ?? undefined, priority: a.priority })),
      keyTopics: r.key_topics,
      insights: r.insights,
      model: r.model,
    };
  },

  async answer(input, onDelta, signal): Promise<ChatResult> {
    const r = await call<{ answer: string; citations: string[]; model: string }>(
      '/ai/chat',
      { question: input.question, snippets: input.snippets.map((s) => ({ meeting_id: s.meetingId, title: s.title, text: s.text })).slice(0, 400) },
      onDelta,
      signal,
    );
    const known = new Set(input.snippets.map((s) => s.meetingId));
    // Only keep citations that point at meetings we actually sent.
    return { answer: r.answer, citations: r.citations.filter((id) => known.has(id)), model: r.model };
  },
};
