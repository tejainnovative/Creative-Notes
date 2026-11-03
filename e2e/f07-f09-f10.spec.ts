import { test, expect, onboard, startRecording, waitForTranscript, connectServer, SETUP_CODE, OFFLINE_NOISE, a11y } from './fixtures';

test.describe('F07 first run', () => {
  test('F07-H1 welcome, name, microphone, home', async ({ page }) => {
    await page.goto('/#/');
    await expect(page).toHaveURL(/#\/welcome/);
    await a11y(page, 'S01 Welcome');
    await onboard(page, { name: 'Priya' });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Priya');
  });

  test('F07-E1 skipping the microphone still lets you in', async ({ page }) => {
    await onboard(page, { mic: false });
    await expect(page.getByRole('button', { name: 'Start recording' }).first()).toBeEnabled();
  });

  test('F07-E3 no name given: the avatar shows no made-up initials', async ({ page }) => {
    await page.goto('/#/welcome');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening)$/);
    await expect(page.locator('header').first()).not.toContainText('CN');
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByText('No name set')).toBeVisible();
    await expect(page.locator('main').getByText('?', { exact: true })).toHaveCount(0);
  });

  test('F07-E2 storage blocked: explains the browser cannot run the app', async ({ page }) => {
    await page.addInitScript(() => {
      IDBFactory.prototype.open = function () {
        throw new DOMException('blocked', 'SecurityError');
      };
    });
    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: "This browser can't run Creative Notes" })).toBeVisible();
    await a11y(page, 'S11 Unsupported');
  });
});

test.describe('F09 quick notes and Siri', () => {
  test('F09-H1 shortcut link saves the note once and removes the text from the address', async ({ page }) => {
    await onboard(page);
    await page.goto(`/#/quick?text=${encodeURIComponent('Call the glass supplier')}`);
    await expect(page.getByText('Note saved')).toBeVisible();
    await expect(page).not.toHaveURL(/text=/);
    await a11y(page, 'S12 Quick note');
    await page.goto('/#/history');
    await expect(page.getByText('Call the glass supplier')).toHaveCount(1);
  });

  test('F09-E1 refreshing after the shortcut does not duplicate the note', async ({ page }) => {
    await onboard(page);
    await page.goto(`/#/quick?text=${encodeURIComponent('Only once please')}`);
    await expect(page.getByText('Note saved')).toBeVisible();
    await page.reload();
    await page.goBack().catch(() => {});
    await page.goto('/#/history');
    await expect(page.getByText('Only once please')).toHaveCount(1);
  });

  test('F09-E2 a Siri token can add a note that arrives on next open, and cannot read', async ({ page }) => {
    await onboard(page);
    await connectServer(page);
    await page.getByRole('button', { name: /Create a Siri shortcut token/ }).click();
    await page.locator('dialog[open]').getByLabel('Setup code').fill(SETUP_CODE);
    await page.getByRole('button', { name: 'Create token' }).click();
    const token = (await page.locator('dialog[open] code').first().textContent())!.trim();
    await page.getByRole('button', { name: 'Done' }).click();
    const text = `From Siri ${test.info().project.name} ${Date.now()}`;
    expect((await page.request.post('/api/inbox', { headers: { authorization: `Bearer ${token}` }, data: { text } })).status()).toBe(201);
    expect((await page.request.get('/api/inbox', { headers: { authorization: `Bearer ${token}` } })).status()).toBe(403);
    await page.reload();
    await page.goto('/#/history');
    await expect(page.getByText(text)).toHaveCount(1);
  });

  test('F09-E3 long notes are capped at 4000 characters with a counter', async ({ page }) => {
    await onboard(page);
    await page.goto('/#/quick');
    await page.getByLabel('Note').fill('x'.repeat(5000));
    await expect(page.getByText('4000 / 4000')).toBeVisible();
  });

  test('F09-E4 emoji and accents are kept and searchable', async ({ page }) => {
    await onboard(page);
    await page.goto('/#/quick');
    await page.getByLabel('Note').fill('Café meeting with José 🚗 about the ute');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.goto('/#/history');
    await page.getByLabel('Search meetings and notes').fill('josé');
    await expect(page.getByText('Café meeting with José 🚗 about the ute')).toBeVisible();
  });

  test.describe('wrong code', () => {
    test.use({ allowConsole: [/401/] });
    test('F09-N1 wrong setup code: clear error, not connected', async ({ page }) => {
      await onboard(page);
      await page.goto('/#/settings');
      await page.getByRole('button', { name: 'Connect this device' }).click();
      await page.locator('dialog[open]').getByLabel('Setup code').fill('definitely-wrong');
      await page.locator('dialog[open]').getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText("That setup code isn't right.");
      await page.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByText('Not connected')).toBeVisible();
    });
  });
});

test.describe('F10 record offline', () => {
  test.use({ allowConsole: [OFFLINE_NOISE] });
  test('F10-H1 offline: transcript now, summary after reconnecting', async ({ page, context }) => {
    await onboard(page);
    await context.setOffline(true);
    await expect(page.getByText(/You're offline/)).toBeVisible();
    await startRecording(page);
    await waitForTranscript(page, 2);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.getByText(/written when you're back online/)).toBeVisible();
    await page.getByRole('tab', { name: 'Transcript' }).click();
    await expect(page.getByLabel('Transcript').locator('li')).not.toHaveCount(0);
    await context.setOffline(false);
    await page.getByRole('tab', { name: 'Summary' }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 15_000 });
  });

  test('F10-E1 offline-only mode: nothing is sent; the summary waits', async ({ page }) => {
    const aiCalls: string[] = [];
    page.on('request', (r) => r.url().includes('/api/ai/') && aiCalls.push(r.url()));
    await onboard(page);
    await connectServer(page);
    await page.getByRole('switch', { name: 'Offline only' }).click();
    await page.goto('/#/');
    await startRecording(page);
    await waitForTranscript(page, 2);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.getByText(/Offline-only mode is on/).first()).toBeVisible();
    expect(aiCalls).toEqual([]);
  });
});
