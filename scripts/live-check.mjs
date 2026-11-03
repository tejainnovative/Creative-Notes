#!/usr/bin/env node
// Smoke test against a deployed copy: first run, Tasks, a reminder, a calendar file, a quick note.
//   BASE_URL=https://<owner>.github.io/<repo> node scripts/live-check.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = (process.env.BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const ok = (m) => console.log(`  ok  ${m}`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${base}/#/welcome`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByRole('button', { name: 'Try with sample meetings' }).click();
  await page.locator('main a[href*="#/m/"]').nth(3).waitFor();
  ok('first run and sample meetings');

  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await page.getByText('Order more masking tape and sanding discs').waitFor();
  await page.getByLabel('New task').fill('Check the live site works');
  await page.getByRole('radio', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('region', { name: 'Today' }).getByText('Check the live site works').waitFor();
  ok('Tasks: sample to-dos shown, new task added for today');

  await page.getByRole('button', { name: 'Edit Check the live site works' }).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('button', { name: 'In 1 hour' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), sheet.getByRole('button', { name: 'Add to calendar' }).click()]);
  const ics = readFileSync(await dl.path(), 'utf8');
  if (!ics.includes('BEGIN:VALARM')) throw new Error('calendar file has no alarm');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await page.getByText(/Saved\. Reminder/).waitFor();
  ok('reminder set; calendar file has an alarm');

  await page.goto(`${base}/#/quick`);
  await page.getByRole('button', { name: 'Start dictating' }).waitFor();
  await page.getByLabel('Note').fill('Typed on the live site');
  await page.getByRole('button', { name: 'Make it a task' }).click();
  await page.getByText('Saved and added to Tasks').waitFor();
  ok('Quick note: mic button present; note saved and turned into a task');

  console.log(errors.length ? `page errors:\n${errors.join('\n')}` : '\nlive check passed');
  process.exitCode = errors.length ? 1 : 0;
} catch (err) {
  console.error(`FAILED: ${err.message.split('\n').slice(0, 3).join(' | ')}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
