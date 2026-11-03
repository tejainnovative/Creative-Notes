import type { AiClient, ChatInput, ChatResult, SummaryResult, TranscriptInput } from './types';

/**
 * On-device preview AI, used when this device is not connected to the server.
 * Rule-based: it picks sentences by keyword. Good enough to exercise every screen state,
 * not good enough to ship. Marked in the UI as "Preview summariser".
 */

const DECISION = /\b(we('ll| will)? (go with|decided|agree)|decided|agreed|let's go with|final(ly)?|approved)\b/i;
const ACTION = /\b(i'll|i will|will send|will chase|can (send|chase|do|take)|to do|by (mon|tue|wed|thu|fri|sat|sun|tomorrow|next week|end of))/i;
const RISK = /\b(risk|worried|concern|blocker|blocked|delay|slip|might not|problem)\b/i;
const IDEA = /\b(what if|maybe we|idea|could try|how about)\b/i;
const DUE = /\bby ((mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow|next week|end of (the )?(day|week|month))\b/i;
const STOP = new Set('the a an and or but so to of in on for with at by from this that it is are was were be we you i they he she our your their have has had not just like okay ok yeah um uh then there here what about can will would should could get got also really very more some any all'.split(' '));

function sentences(input: TranscriptInput) {
  return input.segments.flatMap((s) =>
    s.text.split(/(?<=[.!?])\s+/).filter((t) => t.trim().length > 3).map((text) => ({ text: text.trim(), speaker: s.speaker, atMs: s.startMs })),
  );
}

function topWords(texts: string[], n: number): string[] {
  const counts = new Map<string, number>();
  for (const t of texts)
    for (const w of t.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [])
      if (!STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function stream(text: string, onDelta?: (t: string) => void, signal?: AbortSignal) {
  const words = text.split(' ');
  for (let i = 1; i <= words.length; i += 3) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    onDelta?.(words.slice(0, i).join(' '));
    await new Promise((r) => setTimeout(r, 25));
  }
  onDelta?.(text);
}

export const fakeAi: AiClient = {
  name: 'Preview summariser',

  async summarize(input, onDelta, signal): Promise<SummaryResult> {
    const all = sentences(input);
    const notes = input.manualNotes.map((n) => ({ text: n.text, speaker: 'You', atMs: n.atMs }));
    const pool = [...all, ...notes];
    const words = topWords(pool.map((s) => s.text), 4);
    const speakers = new Set(input.segments.map((s) => s.speaker).filter(Boolean));

    const decisions = pool.filter((s) => DECISION.test(s.text)).map((s) => s.text).slice(0, 5);
    const seen = new Set<string>();
    const actionItems = pool
      .filter((s) => ACTION.test(s.text))
      .filter((s) => !seen.has(s.text.toLowerCase()) && seen.add(s.text.toLowerCase()))
      .slice(0, 7)
      .map((s, i) => ({
        owner: s.speaker && s.speaker !== 'S?' ? s.speaker : undefined,
        text: cap(s.text.replace(/^(i'll|i will)\s+/i, '')),
        dueText: DUE.exec(s.text)?.[1],
        priority: (i < 2 ? 1 : i < 5 ? 2 : 3) as 1 | 2 | 3,
      }));
    const insights = pool.flatMap((s) => {
      const kind = DECISION.test(s.text) ? 'decision' : RISK.test(s.text) ? 'risk' : ACTION.test(s.text) ? 'action' : IDEA.test(s.text) ? 'idea' : undefined;
      return kind ? [{ kind, text: s.text, atMs: s.atMs } as const] : [];
    });

    const minutes = Math.max(1, Math.round((input.segments.at(-1)?.startMs ?? 0) / 60000));
    const overview =
      pool.length === 0
        ? 'Nothing was said that could be summarised.'
        : `A ${minutes}-minute conversation${speakers.size > 1 ? ` between ${speakers.size} people` : ''}` +
          (words.length ? ` that mostly covered ${words.slice(0, 3).join(', ')}.` : '.') +
          ` ${decisions.length} decision${decisions.length === 1 ? '' : 's'} and ${actionItems.length} follow-up${actionItems.length === 1 ? '' : 's'} came out of it.`;

    await stream(overview, onDelta, signal);
    return {
      overview,
      decisions,
      actionItems,
      keyTopics: words.map((w) => {
        const hit = pool.find((s) => s.text.toLowerCase().includes(w));
        return { title: cap(w), detail: hit?.text ?? '' };
      }),
      insights,
      model: 'Preview summariser',
    };
  },

  async answer(input: ChatInput, onDelta, signal): Promise<ChatResult> {
    const terms = topWords([input.question, input.question], 6);
    const hits = input.snippets
      .map((s) => ({ s, score: terms.filter((t) => s.text.toLowerCase().includes(t)).length }))
      .filter((h) => h.score > 0 || terms.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    const answer = hits.length
      ? `Here's what I found in ${hits.length === 1 ? 'one meeting' : `${hits.length} meetings`}:\n` +
        hits.map((h) => `• ${h.s.title}: ${h.s.text.slice(0, 180)}${h.s.text.length > 180 ? '…' : ''}`).join('\n')
      : "I couldn't find anything about that in your notes.";
    await stream(answer, onDelta, signal);
    return { answer, citations: [...new Set(hits.map((h) => h.s.meetingId))], model: 'Preview summariser' };
  },
};
