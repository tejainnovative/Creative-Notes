#!/usr/bin/env node
// WCAG 2 contrast check for design tokens. A Node port of a Python
// contrast.py (this machine has no Python). Same pairs format, same thresholds.
//
//   node scripts/contrast.mjs design/tokens.json
//   node scripts/contrast.mjs design/tokens.json --json
//   node scripts/contrast.mjs "#6b7280" "#ffffff"
//
// Pairs: [["fg", "bg"], ["fg", "bg", "large" | "ui"]]. Normal text needs 4.5,
// large text and UI parts (input borders, focus rings) need 3.
// Exits 1 when any pair fails AA, so it can gate a build.

import { readFileSync } from 'node:fs';

const HEX = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const NEEDS = { normal: [4.5, 7], large: [3, 4.5], ui: [3, 3] };

function parseHex(value) {
  const m = HEX.exec(value.trim());
  if (!m) throw new Error(`not a hex colour: ${value}`);
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance([r, g, b]) {
  const chan = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function ratio(fg, bg) {
  const a = luminance(parseHex(fg));
  const b = luminance(parseHex(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// {"light": {"text": "#..."}} -> {"light-text": "#..."}
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_') || k.startsWith('$')) continue;
    const key = prefix ? `${prefix}-${k}` : k;
    if (typeof v === 'string' && HEX.test(v.trim())) out[key] = v.trim();
    else if (v && typeof v === 'object') flatten(v, key, out);
  }
  return out;
}

function check(cols, pairs) {
  return pairs.map(([fg, bg, size = 'normal']) => {
    if (!NEEDS[size]) size = 'normal';
    if (!(fg in cols) || !(bg in cols)) return { fg, bg, size, error: 'unknown token' };
    const r = ratio(cols[fg], cols[bg]);
    const [aa, aaa] = NEEDS[size];
    return { fg, bg, size, ratio: Math.round(r * 100) / 100, aa: r >= aa, aaa: r >= aaa, fg_hex: cols[fg], bg_hex: cols[bg] };
  });
}

function render(rows) {
  const lines = rows.map((r) => {
    if (r.error) return `  ??    ${r.fg.padEnd(24)} on ${r.bg.padEnd(22)} ${r.error}`;
    const grade = r.size === 'ui' ? (r.aa ? 'PASS' : 'FAIL') : r.aaa ? 'AAA' : r.aa ? 'AA' : 'FAIL';
    return `  ${grade.padEnd(5)} ${r.ratio.toFixed(2).padStart(5)}:1  ${r.fg.padEnd(24)} on ${r.bg.padEnd(22)} ${r.size === 'normal' ? '' : r.size}`;
  });
  const fails = rows.filter((r) => r.error || !r.aa).length;
  return `${lines.join('\n')}\n\n  ${rows.length} pairs, ${fails} failing AA`;
}

const args = process.argv.slice(2).filter((a) => a !== '--json');
const asJson = process.argv.includes('--json');
let cols;
let pairs;
try {
  if (args.length === 2 && args.every((a) => HEX.test(a))) {
    cols = { fg: args[0], bg: args[1] };
    pairs = [['fg', 'bg']];
  } else {
    const tokens = JSON.parse(readFileSync(args[0], 'utf8'));
    cols = flatten(tokens.color ?? {});
    pairs = tokens.pairs ?? [];
  }
} catch (err) {
  console.error(`contrast: ${err.message}`);
  process.exit(2);
}
if (!pairs.length) {
  console.error('contrast: no pairs to check. Add a "pairs" list to the token file.');
  process.exit(2);
}
const rows = check(cols, pairs);
console.log(asJson ? JSON.stringify(rows, null, 2) : render(rows));
process.exit(rows.some((r) => r.error || !r.aa) ? 1 : 0);
