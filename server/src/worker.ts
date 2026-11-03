// Cloudflare Worker entry. Static assets (the app) are served by Workers Assets;
// only /api/* reaches this code. Deployed with wrangler (see README).
import Anthropic from '@anthropic-ai/sdk';
import { cleanup, createApp } from './app.ts';
import { d1Db } from './db.ts';
import type { Env } from './env.ts';

interface WorkerEnv extends Env {
  DB: Parameters<typeof d1Db>[0];
  ASSETS: { fetch(req: Request): Promise<Response> };
}

function deps(env: WorkerEnv) {
  return {
    db: d1Db(env.DB),
    env,
    now: () => Date.now(),
    anthropic: (apiKey: string) => new Anthropic({ apiKey }),
    fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  };
}

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    if (new URL(req.url).pathname.startsWith('/api/')) return createApp(deps(env)).fetch(req);
    return env.ASSETS.fetch(req);
  },
  async scheduled(_event: unknown, env: WorkerEnv): Promise<void> {
    await cleanup(deps(env));
  },
};
