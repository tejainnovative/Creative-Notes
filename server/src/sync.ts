import type { Hono } from 'hono';
import { z } from 'zod';
import { requireDevice, type AppEnv } from './auth.ts';
import { bodyLimit } from './limits.ts';

const B64 = /^[A-Za-z0-9+/=_-]*$/;
const Space = z.object({ salt: z.string().min(16).max(200).regex(B64), verifier: z.string().min(16).max(2000).regex(B64) });
const Push = z.object({
  items: z
    .array(
      z.object({
        key: z.string().min(16).max(100).regex(B64),
        iv: z.string().max(64).regex(B64).optional(),
        data: z.string().max(3 * 1024 * 1024).regex(B64).optional(),
        deleted: z.boolean().default(false),
      }),
    )
    .max(200),
});
const PAGE = 200;

type Parse = <T extends z.ZodType>(c: { req: { json(): Promise<unknown> } }, s: T) => Promise<{ ok: true; data: z.infer<T> } | { ok: false; issues: string[] }>;

/** Sync routes. Every one needs a full device token; the server never sees plaintext. */
export function syncRoutes(app: Hono<AppEnv>, body: Parse) {
  app.get('/sync/space', requireDevice('full'), async (c) => {
    const row = await c.get('deps').db.first<{ salt: string; verifier: string }>('select salt, verifier from sync_space where id = 1');
    // No space yet is a normal answer (the first device creates it), not an error.
    return c.json(row ?? { salt: null, verifier: null });
  });

  // The first device to turn sync on creates the space; later ones get 409 and the existing one.
  app.put('/sync/space', requireDevice('full'), bodyLimit(8 * 1024), async (c) => {
    const b = await body(c, Space);
    if (!b.ok) return c.json({ error: 'invalid', issues: b.issues }, 400);
    const { db, now } = c.get('deps');
    const { changes } = await db.run('insert into sync_space (id, salt, verifier, created_at) values (1, ?, ?, ?) on conflict (id) do nothing', b.data.salt, b.data.verifier, now());
    const row = await db.first<{ salt: string; verifier: string }>('select salt, verifier from sync_space where id = 1');
    return c.json(row, changes ? 201 : 409);
  });

  // Forgotten passphrase: start again. Removes every synced item (devices keep their own data).
  app.delete('/sync/space', requireDevice('full'), async (c) => {
    const { db } = c.get('deps');
    await db.run('delete from sync_items');
    await db.run('delete from sync_space');
    return c.body(null, 204);
  });

  app.get('/sync/items', requireDevice('full'), async (c) => {
    const since = Math.max(0, Number(c.req.query('since') ?? 0) || 0);
    const rows = await c.get('deps').db.all<{ key: string; seq: number; iv: string | null; data: string | null; deleted: number }>(
      'select key, seq, iv, data, deleted from sync_items where seq > ? order by seq limit ?', since, PAGE + 1,
    );
    const more = rows.length > PAGE;
    const items = rows.slice(0, PAGE).map((r) => ({ key: r.key, seq: r.seq, iv: r.iv ?? undefined, data: r.data ?? undefined, deleted: !!r.deleted }));
    return c.json({ items, more, cursor: items.at(-1)?.seq ?? since });
  });

  app.post('/sync/items', requireDevice('full'), bodyLimit(8 * 1024 * 1024), async (c) => {
    const b = await body(c, Push);
    if (!b.ok) return c.json({ error: 'invalid', issues: b.issues }, 400);
    const { db, now } = c.get('deps');
    const device = c.get('device').id;
    const t = now();
    for (const it of b.data.items) {
      if (!it.deleted && (!it.iv || !it.data)) return c.json({ error: 'invalid', issues: [`items: ${it.key} has no data`] }, 400);
      // One statement, so the next seq can't be handed out twice.
      await db.run(
        `insert into sync_items (key, seq, iv, data, deleted, device_id, updated_at)
         values (?, (select coalesce(max(seq), 0) + 1 from sync_items), ?, ?, ?, ?, ?)
         on conflict (key) do update set seq = excluded.seq, iv = excluded.iv, data = excluded.data,
           deleted = excluded.deleted, device_id = excluded.device_id, updated_at = excluded.updated_at`,
        it.key, it.deleted ? null : it.iv!, it.deleted ? null : it.data!, it.deleted ? 1 : 0, device, t,
      );
    }
    const top = await db.first<{ seq: number | null }>('select max(seq) as seq from sync_items');
    return c.json({ cursor: top?.seq ?? 0 });
  });
}
