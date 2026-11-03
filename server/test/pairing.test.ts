import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';
import { fakeAnthropic, fakeDeepgramFetch, mockReply } from '../src/fakes.ts';
import { migrate, sqliteDb } from '../src/sqlite.ts';

const SETUP = 'test-setup-code-0123456789';

// F09-N2: the lockout is for guessing. Pairing several of your own devices must not lock you out.
test('F09-N2 six correct pairings from one network in an hour all succeed', async () => {
  const db = sqliteDb(':memory:');
  await migrate(db, 'server/migrations');
  const app = createApp({ db, env: { SETUP_CODE: SETUP }, now: () => Date.now(), anthropic: fakeAnthropic(mockReply).factory, fetch: fakeDeepgramFetch() });
  for (let i = 0; i < 6; i++) {
    const res = await app.request('/api/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '5.5.5.5' },
      body: JSON.stringify({ setup_code: SETUP, label: `device ${i}` }),
    });
    assert.equal(res.status, 201, `pairing ${i + 1}`);
  }
});
