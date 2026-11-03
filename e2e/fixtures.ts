import { test as base, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const SETUP_CODE = 'local-dev-setup-code'; // the mock API's default

interface Fixtures {
  /** Console messages matching these won't fail the test (e.g. an expected 401). */
  allowConsole: RegExp[];
  /** Use the scripted demo speech engine (dev-only switch). On by default. */
  demoEngine: boolean;
}

/**
 * Every test: fails on console errors and on any 5xx, uses the demo speech engine,
 * and starts from a clean device (each test gets its own browser context and IndexedDB).
 */
/** Chrome logs every request blocked while offline; expected in offline tests. */
export const OFFLINE_NOISE = /ERR_INTERNET_DISCONNECTED/;

export const test = base.extend<Fixtures>({
  allowConsole: [[], { option: true }],
  demoEngine: [true, { option: true }],
  page: async ({ page, allowConsole, demoEngine }, use) => {
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !allowConsole.some((r) => r.test(m.text()))) problems.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    page.on('response', (r) => {
      if (r.status() >= 500) problems.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    if (demoEngine) await page.addInitScript(() => localStorage.getItem('cn:engine') || localStorage.setItem('cn:engine', 'demo'));
    await use(page);
    expect(problems, 'console errors / 5xx during the test').toEqual([]);
  },
});
export { expect };

/** First run through the real welcome screens. */
export async function onboard(page: Page, { name = 'Sam', samples = false, mic = true } = {}) {
  await page.goto('/#/welcome');
  await page.getByLabel(/What should we call you/).fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: mic ? 'Allow microphone' : 'Not now' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
  if (samples) {
    await page.getByRole('button', { name: 'Try with sample meetings' }).click();
    await expect(page.locator('main a[href^="#/m/"]')).toHaveCount(4);
  }
}

/** Waits until every sample summary has been written. */
export async function samplesSummarised(page: Page) {
  await expect(page.getByText('Summary queued')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText('Summarising')).toHaveCount(0, { timeout: 20_000 });
}

/** Starts a recording from Home, accepting the one-time consent reminder if it shows. */
export async function startRecording(page: Page) {
  await page.getByRole('button', { name: 'Start recording' }).first().click();
  // The consent reminder shows only the first time; wait for whichever comes first.
  const consent = page.getByRole('button', { name: /I'll ask first/ });
  const first = await Promise.race([
    consent.waitFor().then(() => 'consent' as const),
    page.waitForURL(/#\/(record|mic-help)/).then(() => 'navigated' as const),
  ]);
  if (first === 'consent') await consent.click();
  await expect(page).toHaveURL(/#\/(record|mic-help)/);
}

export async function waitForTranscript(page: Page, lines = 2) {
  await expect(page.locator('ol[aria-label="Demo transcript"] > li')).toHaveCount(lines, { timeout: 15_000 }).catch(async () => {
    await expect(page.locator('ol[aria-label="Demo transcript"] > li').nth(lines - 1)).toBeVisible({ timeout: 15_000 });
  });
}

/** Pairs this device with the mock API through Settings. */
export async function connectServer(page: Page) {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Connect this device' }).click();
  await page.locator('dialog[open]').getByLabel('Setup code').fill(SETUP_CODE);
  await page.locator('dialog[open]').getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('Connected to your server')).toBeVisible();
}

/** Reads a stored setting straight from IndexedDB (for checks the UI doesn't expose). */
export async function readSetting(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    (k) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('creative-notes');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('settings', 'readonly');
          const get = tx.objectStore('settings').get(k);
          get.onsuccess = () => resolve(get.result?.value);
          get.onerror = () => reject(get.error);
        };
      }),
    key,
  );
}

/** axe scan, WCAG 2.1 A and AA. Fails with a readable list of rule + target. */
export async function a11y(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = violations.flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact}): ${n.target.join(' ')}`));
  expect(summary, `axe violations on ${label}`).toEqual([]);
}
