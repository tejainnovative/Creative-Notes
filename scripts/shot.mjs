#!/usr/bin/env node
// Full-page screenshot of a local route with the installed Chrome (no browser download).
// Edge on this machine has DeveloperToolsAvailability=2 (company policy), which blocks automation.
//   node scripts/shot.mjs <hash-route> <out.png> [width] [light|dark]
//   node scripts/shot.mjs /design screenshots/design-390-light.png 390 light

import { chromium } from 'playwright-core';

const [route = '/', out = 'shot.png', width = '390', scheme = 'light'] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'chrome', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: Number(width), height: 900 },
    colorScheme: scheme === 'dark' ? 'dark' : 'light',
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: out, fullPage: true });
  console.log(`saved ${out}${errors.length ? `\nconsole errors:\n${errors.join('\n')}` : ' (no console errors)'}`);
} finally {
  await browser.close();
}
