#!/usr/bin/env node
// Offline check against the production build: load once online, go offline, reload,
// and confirm the app shell and stored data still open, and a new quick note saves.
//   node node_modules/vite/bin/vite.js preview --port 4173   (in another terminal)
//   node scripts/offline.mjs

import { chromium } from 'playwright-core';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ok = (m) => console.log(`  ok  ${m}`);
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${base}/#/welcome`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByRole('button', { name: 'Try with sample meetings' }).click();
  await page.locator('main a[href^="#/m/"]').first().waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  ok('online: onboarded, samples loaded, service worker ready');

  await ctx.setOffline(true);
  await page.reload();
  await page.getByText("You're offline").waitFor();
  await page.locator('main a[href^="#/m/"]').first().waitFor();
  ok('offline reload: app opens from cache with stored meetings');

  await page.goto(`${base}/#/quick`);
  await page.getByLabel('Note').fill('Written with no connection');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Note saved').waitFor();
  ok('offline: quick note saved');

  console.log(errors.length ? `page errors:\n${errors.join('\n')}` : '\noffline check passed');
  process.exitCode = errors.length ? 1 : 0;
} catch (err) {
  console.error(`FAILED: ${err.message.split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
