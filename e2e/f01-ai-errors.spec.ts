import { test, expect, onboard, startRecording, waitForTranscript, connectServer } from './fixtures';

test.describe('F01 negative: the AI service fails', () => {
  test.use({ allowConsole: [/429/] });
  test('F01-N2 server errors: the user is told, can retry, and the summary arrives once the server is back', async ({ page }) => {
    await onboard(page);
    await connectServer(page);
    let failing = true;
    await page.route('**/api/ai/summary', (route) =>
      failing ? route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"rate_limited"}' }) : route.continue(),
    );
    await page.goto('/#/');
    await startRecording(page);
    await waitForTranscript(page, 2);
    await page.getByRole('button', { name: 'Stop recording' }).click();

    // Not an endless "writing" spinner: a message and a way to retry.
    await expect(page.getByText(/couldn't be reached|try again shortly|will retry/i)).toBeVisible({ timeout: 10_000 });
    failing = false;
    await page.getByRole('button', { name: /Retry now|Try again/ }).click();
    await expect(page.getByText(/Mock summary of/)).toBeVisible({ timeout: 15_000 });
  });
});
