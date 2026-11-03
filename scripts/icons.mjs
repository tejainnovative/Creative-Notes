#!/usr/bin/env node
// Renders the app icon to PNGs for the web manifest. Colours come from the tokens.
//   node scripts/icons.mjs

import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const { color } = JSON.parse(readFileSync('design/tokens.json', 'utf8'));
const bg = color.light.accent;
const fg = color.light['on-accent'];

// Three note lines and a dot: a page of notes with a live recording mark.
const svg = (size, padding) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${padding ? 0 : 22}" fill="${bg}"/>
  <g transform="translate(${padding} ${padding}) scale(${(100 - padding * 2) / 100})">
    <path d="M24 34h40M24 50h52M24 66h30" stroke="${fg}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="72" cy="66" r="7" fill="${fg}"/>
  </g>
</svg>`;

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  for (const [name, size, padding] of [['icon-192', 192, 0], ['icon-512', 512, 0], ['icon-maskable-512', 512, 12], ['apple-touch-icon', 180, 0]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0">${svg(size, padding)}</body></html>`);
    await page.screenshot({ path: `public/icons/${name}.png`, omitBackground: true });
    console.log(`public/icons/${name}.png`);
  }
} finally {
  await browser.close();
}
