import { Hono } from 'hono';
import { z } from 'zod';
import { pairDevice, requireDevice, type AppEnv } from './auth.ts';
import { ChatInput, SummaryInput, chat, summarise } from './ai.ts';
import { open, seal, uuidv7 } from './crypto.ts';
import type { Deps } from './env.ts';
import { bodyLimit, dailyBudget, rateLimit } from './limits.ts';
import { SttTokenInput, sttToken } from './stt.ts';
import { syncRoutes } from './sync.ts';

const PairInput = z.object({
  setup_code: z.string().min(1).max(200),
  label: z.string().trim().min(1).max(60),
  scope: z.enum(['full', 'inbox:write']).default('full'),
});
const InboxPost = z.object({ text: z.string().trim().min(1).max(4000) });
const InboxAck = z.object({ ids: z.array(z.string().max(64)).max(200) });

/** Parses and validates a JSON body; a bad body is a 400 with field paths, never a crash. */
async function body<T extends z.ZodType>(c: { req: { json(): Promise<unknown> } }, schema: T): Promise<{ ok: true; data: z.infer<T> } | { ok: false; issues: string[] }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, issues: ['body: not JSON'] };
  }
  const r = schema.safeParse(raw);
  return r.success ? { ok: true, data: r.data } : { ok: false, issues: r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`) };
}

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>().basePath('/api');

  // Only the app's own origins (ALLOWED_ORIGINS) may call from another site, e.g. the app on
  // GitHub Pages calling this server. Tokens go in a header, never cookies, so there's no CSRF.
  const allowed = new Set((deps.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    const ok = !!origin && allowed.has(origin);
    if (c.req.method === 'OPTIONS') {
      if (!ok) return c.body(null, 403);
      return c.body(null, 204, {
        'Access-Control-Allow-Origin': origin!,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      });
    }
    await next();
    if (ok) {
      c.header('Access-Control-Allow-Origin', origin!);
      c.header('Vary', 'Origin');
    }
  });

  app.use('*', async (c, next) => {
    c.set('deps', deps);
    const started = Date.now();
    await next();
    // Nothing here is cacheable.
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    // Log the route and outcome, never bodies, tokens or query strings.
    console.log(JSON.stringify({ at: 'req', method: c.req.method, route: c.req.routePath, status: c.res.status, ms: Date.now() - started }));
  });

  app.get('/health', (c) =>
    c.json({ ok: true, time: deps.now(), ai: !!deps.env.ANTHROPIC_API_KEY, stt: !!deps.env.DEEPGRAM_API_KEY, inbox: !!deps.env.INBOX_KEY, sync: true }),
  );

  app.post('/pair', bodyLimit(4 * 1024), async (c) => {
    const b = await body(c, PairInput);
    if (!b.ok) return c.json({ error: 'invalid', issues: b.issues }, 400);
    return pairDevice(c, b.data);
  });

  app.get('/devices', requireDevice('full'), async (c) => {
    const rows = await deps.db.all<{ id: string; label: string; scope: string; created_at: number; last_seen_at: number | null }>(
      'select id, label, scope, created_at, last_seen_at from devices where revoked_at is null order by created_at',
    );
    return c.json({ self: c.get('device').id, devices: rows });
  });

  app.delete('/devices/:id', requireDevice('full'), async (c) => {
    const id = c.req.param('id') === 'self' ? c.get('device').id : c.req.param('id');
    const t = deps.now();
    await deps.db.run('update devices set revoked_at = ?, updated_at = ? where id = ? and revoked_at is null', t, t, id);
    return c.body(null, 204);
  });

  app.post('/stt/token', requireDevice('full'), rateLimit('stt'), bodyLimit(4 * 1024), async (c) => {
    const b = await body(c, SttTokenInput);
    if (!b.ok) return c.json({ error: 'invalid', issues: b.issues }, 400);
    return sttToken(c, b.data);
  });

  app.post('/ai/summary', requireDevice('full'), rateLimit('ai'), dailyBudget(), bodyLimit(1024 * 1024), async (c) => {
    const b = await body(c, SummaryInput);
    if (!b.ok) return c.json({ error: 'invalid', issues: b.issues }, 400);
    return summarise(c, b.data);
  });

  app.post('/ai/chat', requireDevice('full'), rateLimit('ai'), dailyBudget(), bodyLimit(512 * 1024), async (c) => {
    const b = await body(c, ChatInput);
    if (!b.ok) return c.json({ error: 'invalid', issues: b.issues }, 400);
    return chat(c, b.data);
  });

  // Siri fallback inbox. A shortcut token can only write; a full device reads and acknowledges.
  app.post('/inbox', requireDevice('inbox:write'), rateLimit('inbox'), bodyLimit(16 * 1024), async (c) => {
    if (!deps.env.INBOX_KEY) return c.json({ error: 'not_configured' }, 503);
    const b = await body(c, InboxPost);
    if (!b.ok) return c.json({ error: 'invalid', issues: b.issues }, 400);
    const t = deps.now();
    const { iv, data } = await seal(deps.env.INBOX_KEY, b.data.text);
    const id = uuidv7(t);
    await deps.db.run('insert into inbox_items (id, device_id, text_enc, iv, created_at, updated_at) values (?, ?, ?, ?, ?, ?)', id, c.get('device').id, data, iv, t, t);
    return c.json({ id }, 201);
  });

  app.get('/inbox', requireDevice('full'), async (c) => {
    if (!deps.env.INBOX_KEY) return c.json({ items: [] });
    const rows = await deps.db.all<{ id: string; text_enc: Uint8Array | ArrayBuffer; iv: Uint8Array | ArrayBuffer; created_at: number }>(
      'select id, text_enc, iv, created_at from inbox_items order by created_at limit 200',
    );
    const items = await Promise.all(
      rows.map(async (r) => ({ id: r.id, created_at: r.created_at, text: await open(deps.env.INBOX_KEY!, new Uint8Array(r.iv), new Uint8Array(r.text_enc)) })),
    );
    return c.json({ items });
  });

  app.post('/inbox/ack', requireDevice('full'), bodyLimit(16 * 1024), async (c) => {
    const b = await body(c, InboxAck);
    if (!b.ok) return c.json({ error: 'invalid', issues: b.issues }, 400);
    for (const id of b.data.ids) await deps.db.run('delete from inbox_items where id = ?', id);
    return c.body(null, 204);
  });

  syncRoutes(app, body);

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.onError((err, c) => {
    console.error(JSON.stringify({ at: 'error', route: c.req.routePath, name: err.name }));
    return c.json({ error: 'server_error' }, 500);
  });
  return app;
}

/** Hourly clean-up (Worker cron, or a timer in local dev). */
export async function cleanup(deps: Pick<Deps, 'db' | 'now'>) {
  const t = deps.now();
  await deps.db.run('delete from inbox_items where created_at < ?', t - 24 * 3_600_000);
  await deps.db.run('delete from pair_attempts where attempted_at < ?', t - 3_600_000);
  await deps.db.run('delete from rate_buckets where refilled_at < ?', t - 24 * 3_600_000);
  await deps.db.run('delete from usage_daily where day < ?', new Date(t - 90 * 86_400_000).toISOString().slice(0, 10));
}
