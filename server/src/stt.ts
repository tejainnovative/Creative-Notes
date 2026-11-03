import type { Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from './auth.ts';
import { recordUsage } from './limits.ts';

export const SttTokenInput = z.object({ language: z.string().max(20).optional() });

const DEEPGRAM_GRANT = 'https://api.deepgram.com/v1/auth/grant';
const DEEPGRAM_LISTEN = 'wss://api.deepgram.com/v1/listen';

/**
 * Gives the browser a short-lived Deepgram token, so audio goes straight from the device
 * to Deepgram and never through this server. The API key never leaves the server.
 */
export async function sttToken(c: Context<AppEnv>, input: z.infer<typeof SttTokenInput>) {
  const { env, fetch: f, now } = c.get('deps');
  if (!env.DEEPGRAM_API_KEY) return c.json({ error: 'not_configured' }, 503);
  const res = await f(DEEPGRAM_GRANT, {
    method: 'POST',
    headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
    // The token only has to be valid while the socket opens; the socket then stays up.
    body: JSON.stringify({ ttl_seconds: 60 }),
  });
  if (!res.ok) {
    console.error(JSON.stringify({ at: 'stt', status: res.status }));
    return c.json({ error: res.status === 401 || res.status === 403 ? 'not_configured' : 'upstream_error' }, 502);
  }
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) return c.json({ error: 'upstream_error' }, 502);

  const params = new URLSearchParams({
    model: 'nova-3',
    smart_format: 'true',
    punctuate: 'true',
    diarize: 'true',
    interim_results: 'true',
    endpointing: '300',
  });
  const lang = input.language && input.language !== 'auto' ? input.language : undefined;
  if (lang) params.set('language', lang);
  else params.set('language', 'multi');

  await recordUsage(c, {});
  return c.json({
    provider: 'deepgram',
    token: body.access_token,
    expires_at: now() + (body.expires_in ?? 60) * 1000,
    url: `${DEEPGRAM_LISTEN}?${params}`,
  });
}
