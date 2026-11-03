import type { Context, MiddlewareHandler } from 'hono';
import type { Deps } from './env.ts';
import { randomToken, safeEqual, sha256, uuidv7 } from './crypto.ts';

export type Scope = 'full' | 'inbox:write';

export interface Device {
  id: string;
  label: string;
  scope: Scope;
}

export type AppEnv = { Variables: { device: Device; deps: Deps } };

const PAIR_ATTEMPTS_PER_HOUR = 5;

/**
 * The one authorisation check. Every route except /health and /pair goes through it.
 * A token is valid when its hash is in `devices`, it isn't revoked, and its scope covers the route.
 */
export function requireDevice(scope: Scope): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const { db, now } = c.get('deps');
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return c.json({ error: 'unauthorised' }, 401);
    const row = await db.first<Device & { last_seen_at: number | null }>(
      'select id, label, scope, last_seen_at from devices where token_hash = ? and revoked_at is null',
      await sha256(token),
    );
    if (!row) return c.json({ error: 'unauthorised' }, 401);
    // A Siri token may only post to the inbox; a full device may do anything.
    if (scope === 'full' && row.scope !== 'full') return c.json({ error: 'forbidden' }, 403);
    const t = now();
    if (!row.last_seen_at || t - row.last_seen_at > 5 * 60_000) await db.run('update devices set last_seen_at = ? where id = ?', t, row.id);
    c.set('device', { id: row.id, label: row.label, scope: row.scope });
    await next();
  };
}

function clientIp(c: Context): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

/** Swaps the setup code for a new device token. Five wrong codes per IP per hour, then locked out. */
export async function pairDevice(c: Context<AppEnv>, input: { setup_code: string; label: string; scope: Scope }) {
  const { db, env, now } = c.get('deps');
  if (!env.SETUP_CODE || env.SETUP_CODE.length < 16) return c.json({ error: 'not_configured' }, 503);
  const t = now();
  const ipHash = await sha256(`pair:${clientIp(c)}`);
  await db.run('delete from pair_attempts where attempted_at < ?', t - 3_600_000);
  const recent = await db.first<{ n: number }>('select count(*) as n from pair_attempts where ip_hash = ?', ipHash);
  // Locked-out IPs are refused even with the right code, so guessing can't continue in the background.
  if ((recent?.n ?? 0) >= PAIR_ATTEMPTS_PER_HOUR) return c.json({ error: 'too_many_attempts' }, 429, { 'Retry-After': '3600' });
  if (!safeEqual(input.setup_code, env.SETUP_CODE)) {
    // Only wrong codes count: pairing several of your own devices must never lock you out.
    await db.run('insert into pair_attempts (ip_hash, attempted_at) values (?, ?)', ipHash, t);
    return c.json({ error: 'wrong_code' }, 401);
  }

  const token = randomToken();
  const id = uuidv7(t);
  await db.run(
    'insert into devices (id, label, token_hash, scope, created_at, updated_at, last_seen_at) values (?, ?, ?, ?, ?, ?, ?)',
    id, input.label, await sha256(token), input.scope, t, t, t,
  );
  return c.json({ device_id: id, token, scope: input.scope }, 201);
}
