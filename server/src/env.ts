import type Anthropic from '@anthropic-ai/sdk';
import type { Db } from './db.ts';

/** Secrets and settings. Names match .env.example; values only ever come from the host. */
export interface Env {
  ANTHROPIC_API_KEY?: string;
  DEEPGRAM_API_KEY?: string;
  /** Typed once on each new device to pair it. Long and random. */
  SETUP_CODE?: string;
  /** base64 of 32 random bytes; encrypts Siri inbox notes at rest. */
  INBOX_KEY?: string;
  /** Defaults to claude-opus-5-5. */
  AI_MODEL?: string;
  /** Input + output tokens per device per UTC day. Default 2,000,000. */
  DAILY_TOKEN_BUDGET?: string;
  /** Comma-separated origins allowed to call the API from another site, e.g. https://you.github.io */
  ALLOWED_ORIGINS?: string;
}

/** Everything a request handler needs. Tests swap any part of it. */
export interface Deps {
  db: Db;
  env: Env;
  now: () => number;
  /** Builds the Claude client. Tests pass a fake. */
  anthropic: (apiKey: string) => Pick<Anthropic, 'beta'>;
  fetch: typeof fetch;
}
