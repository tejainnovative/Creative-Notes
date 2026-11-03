// Stand-ins for Claude and Deepgram, for tests and for MOCK_UPSTREAM=1 local runs.
// They speak the same shapes the real clients return, so the server code paths are the real ones.

import type { Deps } from './env.ts';

type Usage = { input_tokens: number; output_tokens: number };

/** A fake `client.beta.messages.stream()` that streams `json` in small text deltas. */
export function fakeAnthropic(reply: (params: { system?: unknown; messages: { content: unknown }[] }) => { json: string; stop_reason?: string; usage?: Usage }) {
  const calls: unknown[] = [];
  const client = {
    beta: {
      messages: {
        stream(params: { system?: unknown; messages: { content: unknown }[] }) {
          calls.push(params);
          const r = reply(params);
          const chunks = r.json.match(/.{1,7}/gs) ?? [];
          const final = {
            model: 'fake-model',
            stop_reason: r.stop_reason ?? 'end_turn',
            usage: r.usage ?? { input_tokens: 120, output_tokens: 80 },
            content: [{ type: 'text', text: r.json }],
          };
          return {
            async *[Symbol.asyncIterator]() {
              for (const text of chunks) yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } };
            },
            finalMessage: async () => final,
          };
        },
      },
    },
  };
  return { factory: (() => client) as unknown as Deps['anthropic'], calls };
}

/** Plausible structured replies, picked by which schema the request carries. */
export function mockReply(params: { system?: unknown; messages: { content: unknown }[] }) {
  const content = String(params.messages[0]?.content ?? '');
  if (content.includes('<transcript')) {
    const lines = content.split('\n').filter((l) => l.startsWith('['));
    const speaker = /\] ([^:]+):/.exec(lines[0] ?? '')?.[1] ?? null;
    return {
      json: JSON.stringify({
        overview: `Mock summary of ${lines.length} transcript lines. Connect a real ANTHROPIC_API_KEY for real notes.`,
        decisions: lines.length ? ['Keep the current plan (mock decision).'] : [],
        action_items: lines.length ? [{ owner: speaker, text: 'Follow up on the items discussed (mock).', due_text: 'by Friday', priority: 1 }] : [],
        key_topics: lines.length ? [{ title: 'Mock topic', detail: 'Generated without calling Claude.' }] : [],
        insights: lines.length ? [{ kind: 'action', text: 'Follow-up agreed (mock).', at_ms: 0 }] : [],
      }),
    };
  }
  const ids = [...content.matchAll(/meeting_id="([^"]+)"/g)].map((m) => m[1]!);
  return { json: JSON.stringify({ answer: `Mock answer drawn from ${new Set(ids).size} meeting(s).`, citations: [...new Set(ids)].slice(0, 2) }) };
}

/** A fake fetch that answers Deepgram's token grant. */
export function fakeDeepgramFetch(): typeof fetch {
  return (async (url: string | URL | Request) => {
    if (String(url).includes('/v1/auth/grant')) return new Response(JSON.stringify({ access_token: 'fake-jwt', expires_in: 60 }), { status: 200 });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}
