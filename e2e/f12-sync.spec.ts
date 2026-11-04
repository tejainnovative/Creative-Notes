import type { Browser, Page } from '@playwright/test';
import { test, expect, onboard, SETUP_CODE, a11y } from './fixtures';

// One sync space per server, so these run one at a time and only in one project.
test.describe.configure({ mode: 'serial' });

const PASS = 'correct horse battery';

test.beforeEach(async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'shares one sync space on the mock server');
  // Start from an empty sync space.
  const r = await request.post('/api/pair', { data: { setup_code: SETUP_CODE, label: 'test reset', scope: 'full' } });
  const { token } = (await r.json()) as { token: string };
  await request.delete('/api/sync/space', { headers: { authorization: `Bearer ${token}` } });
});

async function turnOnSync(page: Page, passphrase = PASS) {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: /Sync between devices/ }).click();
  await page.getByLabel('Setup code').fill(SETUP_CODE);
  await page.getByLabel('Sync passphrase').fill(passphrase);
  await page.getByLabel('Passphrase again').fill(passphrase);
  await page.getByRole('button', { name: 'Turn on sync' }).click();
}

async function secondDevice(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ permissions: ['microphone'] });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('cn:engine', 'demo'));
  return page;
}

async function addTask(page: Page, text: string) {
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await page.getByLabel('New task').fill(text);
  await page.getByRole('radio', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}

test('F12-H1 a task added on the phone shows on the computer, and ticking it off syncs back', async ({ page, browser }) => {
  // Phone: has data from before sync was turned on.
  await onboard(page, { name: 'Sam' });
  await addTask(page, 'Ring the assessor about the quote');
  await turnOnSync(page);
  await expect(page.getByText(/Sync is on\. Use the same passphrase/)).toBeVisible({ timeout: 30_000 });
  await a11y(page, 'S17 Sync on');

  // Computer: joins with the same passphrase and gets the task.
  const pc = await secondDevice(browser);
  await onboard(pc, { name: 'Sam' });
  await turnOnSync(pc);
  await expect(pc.getByText(/Sync is on\. Your devices are in step/)).toBeVisible({ timeout: 30_000 });
  await pc.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(pc.getByText('Ring the assessor about the quote')).toBeVisible();

  // A task added on the computer reaches the phone within seconds.
  await addTask(pc, 'Send the invoice to the insurer');
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page.getByText('Send the invoice to the insurer')).toBeVisible({ timeout: 30_000 });

  // Ticking it off on the phone shows on the computer.
  await page.getByRole('checkbox', { name: /Send the invoice/ }).click();
  await pc.reload();
  await pc.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(pc.getByRole('button', { name: /^Done \(1\)/ })).toBeVisible({ timeout: 30_000 });
  await expect(pc.getByRole('checkbox', { name: /Send the invoice/, checked: false })).toHaveCount(0);

  // Nothing readable reaches the server.
  const items = await pc.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('creative-notes'); r.onsuccess = () => res(r.result); });
    const token = await new Promise<string>((res) => { const g = db.transaction('settings').objectStore('settings').get('deviceToken'); g.onsuccess = () => res(g.result.value); });
    return (await fetch('/api/sync/items?since=0', { headers: { authorization: `Bearer ${token}` } })).text();
  });
  expect(items).not.toContain('assessor');
  expect(items).not.toContain('invoice');
  await pc.context().close();
});

test('F12-N1 a different passphrase on the second device is refused', async ({ page, browser }) => {
  await onboard(page);
  await turnOnSync(page);
  await expect(page.getByText(/Sync is on. Last synced/)).toBeVisible({ timeout: 30_000 });
  const pc = await secondDevice(browser);
  await onboard(pc);
  await turnOnSync(pc, 'a different passphrase');
  await expect(pc.getByRole('alert')).toHaveText("That passphrase doesn't match the one your other devices use.", { timeout: 30_000 });
  await expect(pc.getByRole('button', { name: 'Turn on sync' })).toBeVisible();
  await pc.context().close();
});

test('F12-H2 a deleted meeting is deleted on the other device too', async ({ page, browser }) => {
  await onboard(page, { samples: true });
  await turnOnSync(page);
  await expect(page.getByText(/Sync is on. Last synced/)).toBeVisible({ timeout: 30_000 });
  const pc = await secondDevice(browser);
  await onboard(pc);
  await turnOnSync(pc);
  await expect(pc.getByText(/Sync is on. Last synced/)).toBeVisible({ timeout: 30_000 });
  await pc.getByRole('link', { name: 'History', exact: true }).click();
  await expect(pc.locator('main a[href^="#/m/"]')).toHaveCount(4, { timeout: 30_000 });

  await page.getByRole('link', { name: 'History', exact: true }).click();
  await page.locator('main a[href^="#/m/"]').first().click();
  await page.getByRole('button', { name: 'Delete meeting' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('main a[href^="#/m/"]')).toHaveCount(3);

  await pc.reload();
  await expect(pc.locator('main a[href^="#/m/"]')).toHaveCount(3, { timeout: 30_000 });
  await pc.context().close();
});
