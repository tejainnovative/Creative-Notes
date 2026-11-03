#!/usr/bin/env node
// Client <-> server check with mock upstreams (no real API keys needed):
//   npm run api:mock      (port 8787)
//   npm run dev           (port 5173, proxies /api)
//   node scripts/backend-e2e.mjs

import { chromium } from 'playwright-core';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const SETUP = process.env.SETUP_CODE ?? 'local-dev-setup-code';
const ok = (m) => console.log(`  ok  ${m}`);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone', 'clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(() => localStorage.setItem('cn:engine', 'demo'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/401|Unauthorized/.test(m.text()) && errors.push(m.text()));

  await page.goto(`${base}/#/welcome`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Allow microphone' }).click();
  await page.getByRole('button', { name: 'Try with sample meetings' }).waitFor();

  // Pair this device
  await page.goto(`${base}/#/settings`);
  await page.getByText('Not connected').waitFor();
  await page.getByRole('button', { name: 'Connect this device' }).click();
  await page.locator('dialog[open]').getByLabel('Setup code').fill('wrong-code');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.getByText("That setup code isn't right.").waitFor();
  ok('wrong setup code is rejected with a clear message');
  await page.locator('dialog[open]').getByLabel('Setup code').fill(SETUP);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.getByText('Connected to your server').waitFor();
  await page.getByText(/AI, speech, Siri inbox/).waitFor();
  await page.getByText(/\(this device\)/).waitFor();
  ok('paired; status shows AI, speech and inbox; device listed');

  // Record -> server summary
  await page.goto(`${base}/#/`);
  await page.getByRole('button', { name: 'Start recording' }).first().click();
  await page.getByRole('button', { name: /I'll ask first/ }).click();
  await page.locator('ol[aria-label="Demo transcript"] li').nth(1).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await page.getByText(/Mock summary of \d+ transcript lines/).waitFor({ timeout: 15000 });
  await page.getByText(/fake-model/).waitFor();
  await page.getByText(/Follow up on the items discussed \(mock\)/).waitFor();
  ok('summary written through the server (streamed, structured, model recorded)');

  // Ask -> server answer
  await page.goto(`${base}/#/ask`);
  await page.getByRole('button', { name: 'What did we decide this week?' }).click();
  await page.getByText(/Mock answer drawn from/).waitFor({ timeout: 15000 });
  ok('Ask answered through the server with citations');

  // Siri token -> inbox -> note
  await page.goto(`${base}/#/settings`);
  await page.getByRole('button', { name: /Create a Siri shortcut token/ }).click();
  await page.locator('dialog[open]').getByLabel('Setup code').fill(SETUP);
  await page.getByRole('button', { name: 'Create token' }).click();
  const token = (await page.locator('dialog code').first().textContent())?.trim();
  if (!token || token.length < 20) throw new Error('no Siri token shown');
  await page.getByRole('button', { name: 'Done' }).click();
  const post = await page.request.post(`${base}/api/inbox`, { headers: { authorization: `Bearer ${token}` }, data: { text: 'Dictated from Siri: book the wheel alignment' } });
  if (post.status() !== 201) throw new Error(`inbox post ${post.status()}`);
  const peek = await page.request.get(`${base}/api/inbox`, { headers: { authorization: `Bearer ${token}` } });
  if (peek.status() !== 403) throw new Error('Siri token could read the inbox');
  await page.reload();
  await page.goto(`${base}/#/history`);
  await page.getByText('Dictated from Siri: book the wheel alignment').waitFor({ timeout: 10000 });
  ok('Siri token posts a note; it lands in History on next open; the token cannot read');

  // Disconnect
  await page.goto(`${base}/#/settings`);
  await page.getByRole('button', { name: 'Remove' }).first().waitFor();
  const rows = page.locator('li', { hasText: '(this device)' });
  await rows.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByText('Not connected').waitFor();
  ok('disconnecting revokes this device and falls back to the preview');

  console.log(errors.length ? `\nconsole errors:\n${errors.join('\n')}` : '\nbackend e2e passed, no console errors');
  process.exitCode = errors.length ? 1 : 0;
} catch (err) {
  console.error(`\nFAILED: ${err.message.split('\n')[0]}`);
  if (errors.length) console.error(`console errors:\n${errors.join('\n')}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
