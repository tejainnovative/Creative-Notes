import { readFileSync } from 'node:fs';
import { test, expect, onboard, samplesSummarised, connectServer, readSetting, startRecording, a11y } from './fixtures';

test.describe('F03 find and review', () => {
  test('F03-H1 search, open, switch tab; the tab survives a reload', async ({ page }) => {
    await onboard(page, { samples: true });
    await samplesSummarised(page);
    await page.getByRole('link', { name: 'History' }).click();
    await a11y(page, 'S06 History');
    await page.getByLabel('Search meetings and notes').fill('insurer');
    await expect(page.getByRole('status').filter({ hasText: '1 result' })).toBeVisible();
    await page.locator('main a[href^="#/m/"]').first().click();
    await page.getByRole('tab', { name: 'Transcript' }).click();
    await expect(page).toHaveURL(/tab=transcript/);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Transcript' })).toHaveAttribute('aria-selected', 'true');
    await a11y(page, 'S04 Transcript');
  });

  test('F03-E1 no results: says so and offers to clear', async ({ page }) => {
    await onboard(page, { samples: true });
    await page.getByRole('link', { name: 'History' }).click();
    await page.getByLabel('Search meetings and notes').fill('zzqxv');
    await expect(page.getByText('Nothing matches')).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).first().click();
    await expect(page.locator('main a[href^="#/m/"]')).toHaveCount(4);
  });

  test('F03-E2 a deleted meeting link shows a clear message', async ({ page }) => {
    await onboard(page);
    await page.goto('/#/m/01890000-0000-7000-8000-000000000000');
    await expect(page.getByText("This meeting isn't here")).toBeVisible();
    await a11y(page, 'S04 missing');
  });

  test.describe('in Sydney time', () => {
    test.use({ timezoneId: 'Australia/Sydney' });
    test('F03-E3 meetings are grouped by the local day', async ({ page }) => {
      await onboard(page, { samples: true });
      await page.getByRole('link', { name: 'History' }).click();
      await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible();
      const yesterday = page.getByRole('region', { name: 'Yesterday' });
      await expect(yesterday.getByText('Notes from the site visit')).toBeVisible();
    });
  });
});

test.describe('F05 export', () => {
  test.beforeEach(async ({ page }) => {
    // Force the download path: the OS share sheet can't be driven headlessly.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { value: undefined });
    });
  });

  test('F05-H1 Markdown, PDF and calendar files download with the meeting in them', async ({ page }) => {
    await onboard(page, { samples: true });
    await samplesSummarised(page);
    await page.getByText('Monday workshop huddle').click();
    await page.getByRole('button', { name: 'Export or share' }).click();
    await a11y(page, 'S09 Export');

    for (const [label, ext, mustContain] of [
      ['Markdown', '.md', '# Monday workshop huddle'],
      ['Calendar events', '-actions.ics', 'BEGIN:VCALENDAR'],
      ['PDF', '.pdf', '%PDF-'],
    ] as const) {
      if (!(await page.getByRole('dialog').isVisible())) await page.getByRole('button', { name: 'Export or share' }).click();
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: new RegExp(`^${label}`) }).click()]);
      expect(download.suggestedFilename()).toBe(`monday-workshop-huddle${ext}`);
      const body = readFileSync((await download.path())!, 'latin1');
      expect(body).toContain(mustContain);
    }
  });

  test('F05-E1 no action items: calendar export is disabled with the reason', async ({ page }) => {
    await onboard(page);
    await startRecording(page);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await page.getByRole('button', { name: 'Export or share' }).click();
    await expect(page.getByRole('button', { name: /Calendar events/ })).toBeDisabled();
    await expect(page.getByText('No action items in this meeting')).toBeVisible();
  });
});

test.describe('F06 delete', () => {
  test('F06-H1 delete from History, then undo', async ({ page }) => {
    await onboard(page, { samples: true });
    await page.getByRole('link', { name: 'History' }).click();
    await page.getByRole('button', { name: 'Delete Weekly planning' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Weekly planning')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Weekly planning')).toBeVisible();
  });

  test('F06-E1 cancel keeps the meeting', async ({ page }) => {
    await onboard(page, { samples: true });
    await page.getByRole('link', { name: 'History' }).click();
    await page.getByRole('button', { name: 'Delete Weekly planning' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Weekly planning')).toBeVisible();
    await expect(page.locator('main a[href^="#/m/"]')).toHaveCount(4);
  });

  test('F06-E2 delete everything wipes the device and revokes it on the server', async ({ page }) => {
    await onboard(page, { samples: true });
    await connectServer(page);
    const token = (await readSetting(page, 'deviceToken')) as string;
    expect(token).toBeTruthy();
    await a11y(page, 'S08 Settings');
    await page.getByRole('button', { name: 'Delete everything' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click();
    await expect(page).toHaveURL(/#\/welcome/);
    const res = await page.request.get('/api/devices', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(401);
    await onboard(page, { name: 'Again' });
    await expect(page.getByText('No meetings yet')).toBeVisible();
  });
});
