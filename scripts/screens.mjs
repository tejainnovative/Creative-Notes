#!/usr/bin/env node
// Captures every screen and checks the basics on each:
// no console errors and no horizontal scroll, at 390 and 1440 wide.
//   node scripts/screens.mjs            (dev server on :5173)
// Output: screenshots/S01.png (390) and S01-1440.png

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const out = 'screenshots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const problems = [];

async function session(width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, permissions: ['microphone'], reducedMotion: 'reduce' });
  await ctx.addInitScript(() => localStorage.setItem('cn:engine', 'demo'));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const suffix = width < 800 ? '' : `-${width}`;

  async function shot(id, { full = true } = {}) {
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (overflow > 1) problems.push(`${id}@${width}: scrolls sideways by ${overflow}px`);
    if (errors.length) problems.push(`${id}@${width}: ${errors.splice(0).join(' | ')}`);
    await page.screenshot({ path: `${out}/${id}${suffix}.png`, fullPage: full });
    console.log(`  ${id}${suffix}`);
  }

  // S01 first run, before anything is stored
  await page.goto(`${base}/#/`);
  await page.getByRole('heading', { name: 'Creative Notes' }).waitFor();
  await shot('S01');
  await page.getByLabel(/What should we call you/).fill('Sam');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Allow microphone' }).click();
  await page.getByRole('button', { name: 'Try with sample meetings' }).waitFor();
  await shot('S02-empty');
  await page.getByRole('button', { name: 'Try with sample meetings' }).click();
  await page.locator('main a[href^="#/m/"]').nth(3).waitFor();
  await page.waitForFunction(() => !document.body.innerText.includes('Summary queued'), null, { timeout: 15000 });
  await shot('S02');

  // S03 live recording
  await page.getByRole('button', { name: 'Start recording' }).first().click();
  await page.getByRole('button', { name: /I'll ask first/ }).click();
  await page.locator('ol[aria-label="Demo transcript"] li').nth(2).waitFor({ timeout: 15000 });
  await shot('S03', { full: false });
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await page.getByRole('heading', { name: 'Overview' }).waitFor({ timeout: 15000 });

  // S04 the long-titled sample meeting
  await page.goto(`${base}/#/history`);
  await page.getByText(/Insurer call about the assessment backlog/).first().click();
  await page.getByRole('heading', { name: 'Overview' }).waitFor();
  await shot('S04');
  await page.getByRole('tab', { name: /Transcript/ }).click();
  await shot('S04-transcript');
  await page.getByRole('button', { name: 'Export or share' }).click();
  await page.getByRole('dialog').waitFor();
  await shot('S09', { full: false });
  await page.keyboard.press('Escape');

  await page.goto(`${base}/#/m/does-not-exist`);
  await page.getByText("This meeting isn't here").waitFor();
  await shot('S04-missing');

  await page.goto(`${base}/#/history`);
  await page.getByRole('heading', { name: 'Today' }).waitFor();
  await shot('S06');
  await page.getByLabel('Search meetings and notes').fill('zzzz');
  await page.getByText('Nothing matches').waitFor();
  await shot('S06-noresults');

  await page.goto(`${base}/#/ask`);
  await page.getByRole('button', { name: 'What did we decide this week?' }).click();
  await page.getByText(/Here's what I found|couldn't find/).waitFor({ timeout: 15000 });
  await shot('S07');

  await page.goto(`${base}/#/settings`);
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await shot('S08');
  await page.goto(`${base}/#/mic-help`);
  await shot('S10');
  await page.goto(`${base}/#/unsupported`);
  await shot('S11');
  await page.goto(`${base}/#/quick?text=${encodeURIComponent('Call the glass supplier about the windscreen')}`);
  await page.getByText('Note saved').waitFor();
  await shot('S12');
  await page.goto(`${base}/#/settings/offline`);
  await shot('S13');
  await page.goto(`${base}/#/install`);
  await shot('S14');

  await ctx.close();
}

try {
  console.log('390 wide');
  await session(390);
  console.log('1440 wide');
  await session(1440);
} catch (err) {
  problems.push(`FAILED: ${err.message.split('\n')[0]}`);
} finally {
  await browser.close();
}
console.log(problems.length ? `\nproblems:\n${problems.map((p) => `  - ${p}`).join('\n')}` : '\nall screens captured, no console errors, no sideways scroll');
process.exitCode = problems.length ? 1 : 0;
