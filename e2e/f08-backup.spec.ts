import { readFileSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, onboard, samplesSummarised, connectServer, a11y } from './fixtures';

const PASS = 'correct horse battery staple';

test.beforeEach(async ({ page }) => {
  // Force the download path: the OS share sheet can't be driven headlessly.
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined }));
});

async function backUp(page: Page, pass = PASS): Promise<string> {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: /Back up to a file/ }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Passphrase', { exact: true }).fill(pass);
  await dialog.getByLabel('Passphrase again').fill(pass);
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Create backup' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^creative-notes-backup-\d{4}-\d{2}-\d{2}\.cnbackup$/);
  return (await download.path())!;
}

async function restore(page: Page, file: string, pass = PASS) {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: /Restore from a file/ }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Backup file').setInputFiles(file);
  await dialog.getByLabel('Passphrase', { exact: true }).fill(pass);
  await dialog.getByRole('button', { name: 'Open backup' }).click();
}

test.describe('F08 back up and restore', () => {
  test('F08-H1 back up, wipe the device, restore: everything comes back and is searchable', async ({ page }) => {
    await onboard(page, { samples: true });
    await samplesSummarised(page);
    const file = await backUp(page);
    await expect(page.getByText(/Last backup/)).toContainText(/today|just now/i);
    await a11y(page, 'S08 Settings after backup');

    await page.getByRole('button', { name: 'Delete everything' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click();
    await onboard(page, { name: 'Restored' });
    await expect(page.getByText('No meetings yet')).toBeVisible();

    await restore(page, file);
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByText(/^Adds 4 meetings and 2 notes to this device/)).toBeVisible();
    await a11y(page, 'S08 Restore preview');
    await dialog.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText(/Restored 4 meetings and 2 notes/)).toBeVisible();

    await page.goto('/#/history');
    await expect(page.locator('main a[href^="#/m/"]')).toHaveCount(4);
    await page.getByLabel('Search meetings and notes').fill('insurer');
    await expect(page.getByRole('status').filter({ hasText: '1 result' })).toBeVisible();
    await page.locator('main a[href^="#/m/"]').first().click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('F08-E1 restoring the same backup twice adds nothing the second time', async ({ page }) => {
    await onboard(page, { samples: true });
    const file = await backUp(page);
    await restore(page, file);
    await expect(page.locator('dialog[open]').getByText(/Nothing new to add/)).toBeVisible();
    await page.goto('/#/history');
    await expect(page.locator('main a[href^="#/m/"]')).toHaveCount(4);
  });

  test('F08-E2 the file is encrypted and never contains the device token', async ({ page }) => {
    await onboard(page, { samples: true });
    await connectServer(page);
    const body = readFileSync(await backUp(page), 'utf8');
    const env = JSON.parse(body);
    expect(env.app).toBe('creative-notes');
    expect(env.kdf.name).toBe('PBKDF2');
    expect(env.kdf.iterations).toBeGreaterThanOrEqual(600_000);
    expect(env.cipher.name).toBe('AES-GCM');
    for (const plain of ['Monday workshop huddle', 'Insurer call', 'supplier', 'deviceToken', 'Bearer']) expect(body).not.toContain(plain);
  });

  test('F08-N1 wrong passphrase: clear message, nothing changes', async ({ page }) => {
    await onboard(page, { samples: true });
    const file = await backUp(page);
    await restore(page, file, 'not the passphrase');
    await expect(page.locator('dialog[open]').getByRole('alert')).toHaveText("That passphrase doesn't open this backup.");
  });

  test('F08-N2 not a backup file, and a backup from a newer version', async ({ page }, info) => {
    await onboard(page);
    const junk = info.outputPath('notes.txt');
    writeFileSync(junk, 'just some text');
    await restore(page, junk);
    await expect(page.locator('dialog[open]').getByRole('alert')).toHaveText("This isn't a Creative Notes backup file.");

    const future = info.outputPath('future.cnbackup');
    writeFileSync(future, JSON.stringify({ app: 'creative-notes', kind: 'backup', format: 99 }));
    await page.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click();
    await restore(page, future);
    await expect(page.locator('dialog[open]').getByRole('alert')).toHaveText(/newer version of Creative Notes/);
  });

  test('F08-N3 passphrase too short or not matching: cannot create the backup', async ({ page }) => {
    await onboard(page, { samples: true });
    await page.goto('/#/settings');
    await page.getByRole('button', { name: /Back up to a file/ }).click();
    const dialog = page.locator('dialog[open]');
    await dialog.getByLabel('Passphrase', { exact: true }).fill('short');
    await dialog.getByLabel('Passphrase again').fill('short');
    await expect(dialog.getByRole('button', { name: 'Create backup' })).toBeDisabled();
    await dialog.getByLabel('Passphrase', { exact: true }).fill('long enough passphrase');
    await dialog.getByLabel('Passphrase again').fill('long enough passphrasx');
    await expect(dialog.getByText("The passphrases don't match.")).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create backup' })).toBeDisabled();
  });
});
