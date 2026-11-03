import { test, expect, onboard, startRecording, waitForTranscript, a11y } from './fixtures';

test.describe('F01 record a meeting', () => {
  test('F01-H1 happy path: transcript, note, summary, history', async ({ page }) => {
    await onboard(page);
    await a11y(page, 'S02 Home');
    await startRecording(page);
    await waitForTranscript(page, 2);
    await expect(page.getByRole('status').filter({ hasText: 'Recording' })).toBeVisible();
    await a11y(page, 'S03 Live meeting');

    await page.getByLabel('Add a note to this meeting').fill('Check the courtesy car booking');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Note added to the meeting')).toBeVisible();

    await waitForTranscript(page, 4);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page).toHaveURL(/#\/m\/.+tab=summary/);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Action items' })).toBeVisible();
    await a11y(page, 'S04 Meeting summary');

    await page.getByRole('link', { name: 'History' }).click();
    await expect(page.locator('main a[href^="#/m/"]')).toHaveCount(1);
  });

  test('F01-E1 double click on start makes one recording', async ({ page }) => {
    await onboard(page);
    await page.getByRole('button', { name: /I'll ask first/ }).isVisible().catch(() => false);
    await page.getByRole('button', { name: 'Start recording' }).first().dblclick();
    const consent = page.getByRole('button', { name: /I'll ask first/ });
    if (await consent.isVisible({ timeout: 1500 }).catch(() => false)) await consent.click();
    await waitForTranscript(page, 1);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page).toHaveURL(/#\/m\//);
    await page.goto('/#/history');
    await expect(page.locator('main a[href^="#/m/"]')).toHaveCount(1);
  });

  test('F01-E2 a second tab cannot start another recording', async ({ page, context }) => {
    await onboard(page);
    await startRecording(page);
    await waitForTranscript(page, 1);

    const other = await context.newPage();
    await other.goto('/#/');
    await other.getByRole('button', { name: 'Start recording' }).first().click();
    await expect(other.getByText(/Another Creative Notes tab or window is already recording/)).toBeVisible();
    await other.close();

    await page.getByRole('button', { name: 'Stop recording' }).click();
    await page.goto('/#/history');
    await expect(page.locator('main a[href^="#/m/"]')).toHaveCount(1);
  });

  test('F01-E3 reloading mid-recording does not leave a meeting stuck as recording', async ({ page }) => {
    await onboard(page);
    await startRecording(page);
    await waitForTranscript(page, 2);
    await page.reload();
    await page.goto('/#/history');
    await expect(page.locator('main a[href^="#/m/"]')).toHaveCount(1);
    await expect(page.getByText('Recording', { exact: true })).toHaveCount(0);
    // The words captured before the reload are kept.
    await page.locator('main a[href^="#/m/"]').first().click();
    await page.getByRole('tab', { name: /Transcript/ }).click();
    await expect(page.getByLabel('Transcript').locator('li')).not.toHaveCount(0);
  });

  test('F01-E4 back button keeps recording; the pill leads back and stop works', async ({ page }) => {
    await onboard(page);
    await startRecording(page);
    await waitForTranscript(page, 1);
    await page.goBack();
    const pill = page.getByRole('link', { name: /Back to meeting/ });
    await expect(pill).toBeVisible();
    await pill.click();
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 15_000 });
  });

  test('F01-E5 stopping before anything is said gives "nothing to summarise"', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('cn:engine', 'silent'));
    await onboard(page);
    await startRecording(page);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.getByText('Nothing to summarise')).toBeVisible();
  });

  test('F01-E7 keyboard only: start, consent, stop', async ({ page }) => {
    await onboard(page);
    const record = page.getByRole('button', { name: 'Start recording' }).first();
    for (let i = 0; i < 25 && !(await record.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(record).toBeFocused();
    await page.keyboard.press('Enter');
    // Cancel has focus first in the consent dialog; Tab to the confirm button.
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await waitForTranscript(page, 1);
    const stop = page.getByRole('button', { name: 'Stop recording' });
    for (let i = 0; i < 25 && !(await stop.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(stop).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/m\//);
  });

  test('F01-N1 microphone blocked shows help, and try again works once allowed', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('allowMic')) return;
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    });
    await onboard(page, { mic: false });
    await startRecording(page).catch(() => {});
    await expect(page).toHaveURL(/#\/mic-help/);
    await expect(page.getByRole('alert')).toHaveText('The microphone is blocked');
    await a11y(page, 'S10 Microphone help');
    await page.evaluate(() => sessionStorage.setItem('allowMic', '1'));
    await page.reload();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page).toHaveURL(/#\/record/);
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  });
});
