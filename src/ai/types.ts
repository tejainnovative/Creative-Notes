import type { InsightKind } from '../ui';

export interface TranscriptInput {
  meetingId: string;
  segments: { speaker?: string; text: string; startMs: number }[];
  manualNotes: { text: string; atMs: number }[];
  language: string;
}

export interface SummaryResult {
  overview: string;
  decisions: string[];
  actionItems: { owner?: string; text: string; dueText?: string; priority: 1 | 2 | 3 }[];
  keyTopics: { title: string; detail: string }[];
  insights: { kind: InsightKind; text: string; atMs: number }[];
  model: string;
}

export interface ChatInput {
  question: string;
  snippets: { meetingId: string; title: string; text: string }[];
}

export interface ChatResult {
  answer: string;
  citations: string[];
  model: string;
}

/**
 * What the screens and the job runner call. The fake version (fakeAi.ts) runs in the browser.
 * The HTTP version (httpAi.ts) streams from /api/ai/* with the same shape.
 */
export interface AiClient {
  readonly name: string;
  /** Streams overview text through onDelta, then resolves with the full result. */
  summarize(input: TranscriptInput, onDelta?: (textSoFar: string) => void, signal?: AbortSignal): Promise<SummaryResult>;
  answer(input: ChatInput, onDelta?: (textSoFar: string) => void, signal?: AbortSignal): Promise<ChatResult>;
}

export class AiUnavailableError extends Error {
  constructor(message = 'AI needs a connection') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}
