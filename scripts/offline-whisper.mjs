#!/usr/bin/env node
// Production check: download the speech model, then reopen the app with NO connection and
// transcribe real speech. Proves the runtime and model really come back from the cache.
//   npm run build && node node_modules/vite/bin/vite.js preview --port 4173   (another terminal)
//   node scripts/offline-whisper.mjs

import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const ok = (m) => console.log(`  ok  ${m}`);
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${resolve('e2e/fixtures/jfk.wav')}`],
});
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${base}/#/welcome`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Allow microphone' }).click();
  await page.getByRole('heading', { name: /^Good (morning|afternoon|evening)/ }).waitFor(); // welcome has finished navigating
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto(`${base}/#/settings/offline`);
  await page.getByRole('button', { name: 'Download speech model' }).click();
  await page.getByText('Ready. Works with no connection.').waitFor({ timeout: 5 * 60_000 });
  ok('model downloaded online');

  await ctx.setOffline(true);
  await page.close();
  const fresh = await ctx.newPage(); // like reopening the app later
  fresh.on('pageerror', (e) => errors.push(e.message));
  await fresh.goto(`${base}/#/`);
  await fresh.getByText("You're offline").waitFor();
  await fresh.getByRole('button', { name: 'Start recording' }).first().click();
  await fresh.getByRole('button', { name: /I'll ask first/ }).click();
  await fresh.getByText('On device').waitFor();
  const text = fresh.getByRole('list', { name: 'Transcript' });
  await text.filter({ hasText: /your country/i }).waitFor({ timeout: 120_000 });
  ok(`reopened offline, transcribed on device: "${(await text.innerText()).replace(/\s+/g, ' ').slice(0, 120)}…"`);
  await fresh.getByRole('button', { name: 'Stop recording' }).click();

  console.log(errors.length ? `page errors:\n${errors.join('\n')}` : '\noffline speech check passed');
  process.exitCode = errors.length ? 1 : 0;
} catch (err) {
  console.error(`FAILED: ${err.message.split('\n').slice(0, 5).join(' | ')}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
