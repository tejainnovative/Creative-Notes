import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './auth.ts';

type Group = 'ai' | 'stt' | 'inbox';

/** Burst size and refill rate per device. Generous for one person, tight for abuse. */
const BUCKETS: Record<Group, { capacity: number; perMinute: number }> = {
  ai: { capacity: 30, perMinute: 2 },
  stt: { capacity: 20, perMinute: 2 },
  inbox: { capacity: 30, perMinute: 5 },
};

/** Token bucket per device and route group, stored in rate_buckets. */
export function rateLimit(group: Group): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const { db, now } = c.get('deps');
    const device = c.get('device');
    const { capacity, perMinute } = BUCKETS[group];
    const t = now();
    const row = await db.first<{ tokens: number; refilled_at: number }>(
      'select tokens, refilled_at from rate_buckets where device_id = ? and route_group = ?', device.id, group,
    );
    const tokens = Math.min(capacity, (row?.tokens ?? capacity) + ((t - (row?.refilled_at ?? t)) / 60_000) * perMinute);
    if (tokens < 1) {
      const wait = Math.ceil(((1 - tokens) / perMinute) * 60);
      return c.json({ error: 'rate_limited' }, 429, { 'Retry-After': String(wait) });
    }
    await db.run(
      `insert into rate_buckets (device_id, route_group, tokens, refilled_at) values (?, ?, ?, ?)
       on conflict (device_id, route_group) do update set tokens = excluded.tokens, refilled_at = excluded.refilled_at`,
      device.id, group, tokens - 1, t,
    );
    await next();
  };
}

/** Rejects request bodies over `max` bytes before they are parsed. */
export function bodyLimit(max: number): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const len = Number(c.req.header('content-length') ?? 0);
    if (len > max) return c.json({ error: 'too_large' }, 413);
    const body = await c.req.raw.clone().arrayBuffer();
    if (body.byteLength > max) return c.json({ error: 'too_large' }, 413);
    await next();
  };
}

export const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Blocks AI calls once the device has used its daily token budget. */
export function dailyBudget(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const { db, env, now } = c.get('deps');
    const budget = Number(env.DAILY_TOKEN_BUDGET ?? 2_000_000);
    const used = await db.first<{ n: number }>(
      'select ai_input_tokens + ai_output_tokens as n from usage_daily where device_id = ? and day = ?', c.get('device').id, utcDay(now()),
    );
    if ((used?.n ?? 0) >= budget) return c.json({ error: 'daily_budget_reached' }, 429, { 'Retry-After': '3600' });
    await next();
  };
}

export async function recordUsage(c: Parameters<MiddlewareHandler<AppEnv>>[0], usage: { input?: number; output?: number; sttSeconds?: number }) {
  const { db, now } = c.get('deps');
  await db.run(
    `insert into usage_daily (device_id, day, ai_input_tokens, ai_output_tokens, stt_seconds, requests) values (?, ?, ?, ?, ?, 1)
     on conflict (device_id, day) do update set
       ai_input_tokens = ai_input_tokens + excluded.ai_input_tokens,
       ai_output_tokens = ai_output_tokens + excluded.ai_output_tokens,
       stt_seconds = stt_seconds + excluded.stt_seconds,
       requests = requests + 1`,
    c.get('device').id, utcDay(now()), usage.input ?? 0, usage.output ?? 0, usage.sttSeconds ?? 0,
  );
}
