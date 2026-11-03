// Local API server on Node: `npm run api` (port 8787). Vite proxies /api here.
// Reads secrets from .env.local. MOCK_UPSTREAM=1 swaps Claude and Deepgram for fakes.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import Anthropic from '@anthropic-ai/sdk';
import { cleanup, createApp } from './app.ts';
import type { Env } from './env.ts';
import { fakeAnthropic, fakeDeepgramFetch, mockReply } from './fakes.ts';
import { migrate, sqliteDb } from './sqlite.ts';

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return out;
}

const fileEnv = loadEnvFile('.env.local');
const env: Env & { MOCK_UPSTREAM?: string; PORT?: string } = { ...fileEnv, ...process.env } as never;
const mock = env.MOCK_UPSTREAM === '1' || process.argv.includes('--mock');
if (mock) {
  env.ANTHROPIC_API_KEY ||= 'mock';
  env.DEEPGRAM_API_KEY ||= 'mock';
  env.SETUP_CODE ||= 'local-dev-setup-code';
  env.INBOX_KEY ||= btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
}

mkdirSync('.data', { recursive: true });
const db = sqliteDb(mock ? '.data/mock.sqlite' : '.data/local.sqlite');
const applied = await migrate(db, 'server/migrations');

const deps = {
  db,
  env,
  now: () => Date.now(),
  anthropic: mock ? fakeAnthropic(mockReply).factory : (apiKey: string) => new Anthropic({ apiKey }),
  fetch: mock ? fakeDeepgramFetch() : fetch,
};
const app = createApp(deps);
setInterval(() => void cleanup(deps), 3_600_000).unref();

const port = Number(env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  const missing = (['ANTHROPIC_API_KEY', 'DEEPGRAM_API_KEY', 'SETUP_CODE', 'INBOX_KEY'] as const).filter((k) => !env[k]);
  console.log(`Creative Notes API on http://127.0.0.1:${port}/api ${mock ? '(MOCK upstreams)' : ''}`);
  if (applied.length) console.log(`applied migrations: ${applied.join(', ')}`);
  if (missing.length) console.log(`not configured (see .env.example): ${missing.join(', ')}`);
});
