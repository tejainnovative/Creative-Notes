import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';
import { fakeAnthropic, fakeDeepgramFetch } from '../src/fakes.ts';
import { migrate, sqliteDb } from '../src/sqlite.ts';

const SETUP = 'test-setup-code-0123456789';
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  const db = sqliteDb(':memory:');
  await migrate(db, 'server/migrations');
  app = createApp({ db, env: { SETUP_CODE: SETUP, ALLOWED_ORIGINS: 'https://me.github.io' }, now: () => 1, anthropic: fakeAnthropic().factory, fetch: fakeDeepgramFetch() });
});

const req = (method: string, body?: unknown, token?: string, headers: Record<string, string> = {}) => ({
  method,
  headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  body: body ? JSON.stringify(body) : undefined,
});
async function pair(scope = 'full'): Promise<string> {
  const r = await app.request('/api/pair', req('POST', { setup_code: SETUP, label: 'd', scope }));
  return ((await r.json()) as { token: string }).token;
}
const K = (n: number) => `key${String(n).padStart(20, '0')}`;

test('sync needs a full device token', async () => {
  assert.equal((await app.request('/api/sync/items')).status, 401);
  const siri = await pair('inbox:write');
  assert.equal((await app.request('/api/sync/items', req('GET', undefined, siri))).status, 403);
  assert.equal((await app.request('/api/sync/space', req('GET', undefined, siri))).status, 403);
});

test('the first device creates the space; the second gets the same salt back', async () => {
  const a = await pair();
  const b = await pair();
  assert.deepEqual(await (await app.request('/api/sync/space', req('GET', undefined, a))).json(), { salt: null, verifier: null });
  const one = await app.request('/api/sync/space', req('PUT', { salt: 'c2FsdHNhbHRzYWx0c2FsdA', verifier: 'dmVyaWZpZXJ2ZXJpZmllcg' }, a));
  assert.equal(one.status, 201);
  const two = await app.request('/api/sync/space', req('PUT', { salt: 'b3RoZXJvdGhlcm90aGVyb3RoZXI', verifier: 'dmVyaWZpZXJ2ZXJpZmllcg' }, b));
  assert.equal(two.status, 409);
  assert.equal(((await two.json()) as { salt: string }).salt, 'c2FsdHNhbHRzYWx0c2FsdA');
});

test('push and pull: newer writes move to the end, deletes are tombstones, paging works', async () => {
  const a = await pair();
  const b = await pair();
  const push = (items: unknown[], t = a) => app.request('/api/sync/items', req('POST', { items }, t));
  assert.equal((await push([{ key: K(1), iv: 'aXY', data: 'ZGF0YQ' }, { key: K(2), iv: 'aXY', data: 'ZGF0YQ' }])).status, 200);
  const first = (await (await app.request('/api/sync/items?since=0', req('GET', undefined, b))).json()) as { items: { key: string; seq: number }[]; cursor: number };
  assert.deepEqual(first.items.map((i) => i.key), [K(1), K(2)]);
  await push([{ key: K(1), deleted: true }], b);
  const next = (await (await app.request(`/api/sync/items?since=${first.cursor}`, req('GET', undefined, a))).json()) as { items: { key: string; deleted: boolean; data?: string }[] };
  assert.deepEqual(next.items, [{ key: K(1), seq: 3, iv: undefined, data: undefined, deleted: true }].map(({ iv, data, ...r }) => r));
  // A write without data that isn't a delete is refused.
  assert.equal((await push([{ key: K(3) }])).status, 400);
  // Paging: 250 items come back in two pages.
  await push(Array.from({ length: 200 }, (_, i) => ({ key: K(100 + i), iv: 'aXY', data: 'ZA' })));
  await push(Array.from({ length: 50 }, (_, i) => ({ key: K(400 + i), iv: 'aXY', data: 'ZA' })));
  const p1 = (await (await app.request('/api/sync/items?since=3', req('GET', undefined, a))).json()) as { items: unknown[]; more: boolean; cursor: number };
  assert.equal(p1.items.length, 200);
  assert.equal(p1.more, true);
  const p2 = (await (await app.request(`/api/sync/items?since=${p1.cursor}`, req('GET', undefined, a))).json()) as { items: unknown[]; more: boolean };
  assert.equal(p2.items.length, 50);
  assert.equal(p2.more, false);
});

test('only allowed origins get CORS headers', async () => {
  const ok = await app.request('/api/sync/items', req('OPTIONS', undefined, undefined, { origin: 'https://me.github.io' }));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://me.github.io');
  const bad = await app.request('/api/sync/items', req('OPTIONS', undefined, undefined, { origin: 'https://evil.example' }));
  assert.equal(bad.status, 403);
  const get = await app.request('/api/health', { headers: { origin: 'https://evil.example' } });
  assert.equal(get.headers.get('access-control-allow-origin'), null);
});
