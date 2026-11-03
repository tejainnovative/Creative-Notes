import { test, expect, onboard, startRecording, waitForTranscript, samplesSummarised, connectServer, OFFLINE_NOISE, a11y } from './fixtures';

test.describe('F02 copilot during a meeting', () => {
  test.use({ allowConsole: [OFFLINE_NOISE] });
  test('F02-H1 ask while recording; the answer is kept with the meeting', async ({ page }) => {
    await onboard(page);
    await startRecording(page);
    await waitForTranscript(page, 3);
    await page.getByRole('tab', { name: 'Copilot' }).click();
    await page.getByRole('button', { name: 'Who said they would do something?' }).click();
    await expect(page.getByLabel('Conversation').getByText(/Here's what I found|couldn't find/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await page.getByRole('tab', { name: 'Copilot' }).click();
    await expect(page.getByLabel('Conversation').getByText('Who said they would do something?')).toBeVisible();
  });

  test('F02-E1 offline: asking is disabled with a reason', async ({ page, context }) => {
    await onboard(page);
    await startRecording(page);
    await page.getByRole('tab', { name: 'Copilot' }).click();
    await context.setOffline(true);
    await expect(page.getByText('Asking needs a connection. Your notes still work offline.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Stop recording' }).click();
  });
});

test.describe('F04 ask across meetings', () => {
  test('F04-H1 suggestion chip gives an answer with citations that open the meeting', async ({ page }) => {
    await onboard(page, { samples: true });
    await samplesSummarised(page);
    await page.getByRole('link', { name: 'Ask' }).click();
    await a11y(page, 'S07 Ask empty');
    await page.getByRole('button', { name: 'What did we decide this week?' }).click();
    const sources = page.getByRole('list', { name: 'Sources' }).getByRole('link');
    await expect(sources.first()).toBeVisible({ timeout: 10_000 });
    await a11y(page, 'S07 Ask answered');
    await sources.first().click();
    await expect(page).toHaveURL(/#\/m\//);
  });

  test('F04-E1 no meetings yet: empty state points to recording', async ({ page }) => {
    await onboard(page);
    await page.getByRole('link', { name: 'Ask' }).click();
    await expect(page.getByText('Nothing to ask about yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Record a meeting' })).toBeVisible();
  });

  test('F04-E2 unpaired: answers come from the device; nothing goes to /api/ai', async ({ page }) => {
    const aiCalls: string[] = [];
    page.on('request', (r) => r.url().includes('/api/ai/') && aiCalls.push(r.url()));
    await onboard(page, { samples: true });
    await samplesSummarised(page);
    await page.getByRole('link', { name: 'Ask' }).click();
    await page.getByRole('button', { name: 'Who said they would follow up?' }).click();
    await expect(page.getByLabel('Conversation').getByText(/Here's what I found|couldn't find/)).toBeVisible();
    expect(aiCalls).toEqual([]);
  });

  test('F04-H2 paired: answers come from the server', async ({ page }) => {
    await onboard(page, { samples: true });
    await connectServer(page);
    await page.getByRole('link', { name: 'Ask' }).click();
    await page.getByRole('button', { name: 'What risks came up recently?' }).click();
    await expect(page.getByText(/Mock answer drawn from/)).toBeVisible({ timeout: 10_000 });
  });
});
