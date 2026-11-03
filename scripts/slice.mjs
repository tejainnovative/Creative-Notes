#!/usr/bin/env node
// Vertical slice check: first run -> record -> stop -> summary -> history.
// Uses installed Chrome with a fake microphone and the demo speech engine.
//   node scripts/slice.mjs            (dev server must be running on :5173)

import { chromium } from 'playwright-core';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const errors = [];
const step = (msg) => console.log(`  ok  ${msg}`);
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
  await ctx.addInitScript(() => localStorage.setItem('cn:engine', 'demo'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(`${base}/#/`);
  await page.getByRole('heading', { name: 'Creative Notes' }).waitFor();
  step('first visit redirects to welcome');
  await page.getByLabel(/What should we call you/).fill('Sam');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Allow microphone' }).click();
  await page.getByRole('heading', { name: /Sam/ }).waitFor();
  step('onboarded, home greets by name');

  await page.getByRole('button', { name: 'Start recording' }).first().click();
  await page.getByRole('button', { name: /I'll ask first/ }).click();
  step('consent reminder shown once');
  await page.waitForURL(/#\/record/);
  await page.locator('ol[aria-label="Demo transcript"] li').nth(2).waitFor({ timeout: 15000 });
  step('live transcript is streaming');
  await page.getByLabel('Add a note to this meeting').fill('Check the courtesy car booking');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByText('Note added to the meeting').waitFor();
  step('manual note added');
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await page.waitForURL(/#\/m\/.+tab=summary/);
  await page.getByRole('heading', { name: 'Overview' }).waitFor({ timeout: 15000 });
  await page.getByRole('heading', { name: 'Action items' }).waitFor();
  step('stopped, summary written with action items');

  await page.getByRole('link', { name: 'History' }).click();
  await page.getByRole('heading', { name: 'Today' }).waitFor();
  const rows = await page.locator('main a[href^="#/m/"]').count();
  if (rows < 1) throw new Error('history has no meetings');
  step(`history lists ${rows} meeting(s)`);

  await page.getByLabel('Search meetings and notes').fill('courtesy');
  await page.getByText(/1 result/).waitFor();
  step('search finds the meeting by its manual note');

  console.log(errors.length ? `\nconsole errors:\n${errors.join('\n')}` : '\nslice passed, no console errors');
  process.exitCode = errors.length ? 1 : 0;
} catch (err) {
  console.error(`\nFAILED: ${err.message.split('\n')[0]}`);
  if (errors.length) console.error(`console errors:\n${errors.join('\n')}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
