import { readFileSync } from 'node:fs';
import { test, expect, onboard, samplesSummarised, a11y } from './fixtures';

test.beforeEach(async ({ page }) => {
  // Downloads instead of the OS share sheet, which can't be driven headlessly.
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined }));
});

test.describe('F11 tasks, reminders and voice notes', () => {
  test('F11-H1 add a to-do for today, tick it off, undo', async ({ page }) => {
    await onboard(page);
    await page.getByRole('link', { name: 'Tasks', exact: true }).click();
    await expect(page.getByText('No tasks yet')).toBeVisible();
    await a11y(page, 'S16 Tasks empty');

    await page.getByLabel('New task').fill('Call the panel shop about the bumper');
    await page.getByRole('radio', { name: 'Today' }).click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const today = page.getByRole('region', { name: 'Today' });
    await expect(today.getByText('Call the panel shop about the bumper')).toBeVisible();
    await expect(today.getByText('Due today')).toBeVisible();
    await a11y(page, 'S16 Tasks with a task');

    await today.getByRole('checkbox', { name: /Call the panel shop/ }).click();
    await expect(page.getByText('All done')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('region', { name: 'Today' }).getByRole('checkbox', { name: /Call the panel shop/ })).not.toBeChecked();
  });

  test('F11-H2 meeting action items are in Tasks, linked, and ticking them updates the meeting', async ({ page }) => {
    await onboard(page, { samples: true });
    await samplesSummarised(page);
    await page.getByRole('link', { name: 'Tasks', exact: true }).click();
    await page.getByRole('radio', { name: 'From meetings' }).click();
    const firstLink = page.getByRole('link', { name: /^From: / }).first();
    await expect(firstLink).toBeVisible();
    const box = page.getByRole('checkbox').first();
    const label = (await box.evaluate((el) => (el.labels?.[0]?.textContent ?? '').trim()));
    await box.click();
    await page.getByRole('button', { name: /^Done \(/ }).click();
    await page.getByRole('region', { name: 'Done' }).getByRole('link', { name: /^From: / }).first().click();
    await expect(page.getByRole('checkbox', { name: label })).toBeChecked();
    await expect(page.getByRole('link', { name: 'Set due dates and reminders in Tasks' })).toBeVisible();
  });

  test('F11-H3 set a reminder, see it on the task, and add it to the calendar with an alarm', async ({ page }) => {
    await onboard(page, { samples: true });
    await page.getByRole('link', { name: 'Tasks', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Look into a second spray booth filter supplier' }).click();
    const sheet = page.locator('dialog[open]');
    await sheet.getByRole('button', { name: 'Tomorrow 9 am' }).click();
    await a11y(page, 'S16 Task sheet');
    const [download] = await Promise.all([page.waitForEvent('download'), sheet.getByRole('button', { name: 'Add to calendar' }).click()]);
    const ics = readFileSync((await download.path())!, 'utf8');
    expect(ics).toContain('SUMMARY:Look into a second spray booth filter supplier');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Saved\. Reminder tomorrow/)).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'second spray booth' }).getByText(/Tomorrow, 9:00/)).toBeVisible();
  });

  test('F11-H4 a reminder pops up when it comes due while the app is open', async ({ page }) => {
    await page.clock.install({ time: new Date() });
    await onboard(page);
    await page.getByRole('link', { name: 'Tasks', exact: true }).click();
    await page.getByLabel('New task').fill('Pick up the courtesy car keys');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Pick up the courtesy car keys' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'In 1 hour' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Save' }).click();
    await page.clock.fastForward('01:01:00');
    await expect(page.getByText('Reminder: Pick up the courtesy car keys')).toBeVisible();
    await page.getByRole('button', { name: 'Open' }).click();
    await expect(page).toHaveURL(/#\/tasks/);
  });

  test('F11-E1 an overdue task is shown as overdue', async ({ page }) => {
    await onboard(page);
    await page.getByRole('link', { name: 'Tasks', exact: true }).click();
    await page.getByLabel('New task').fill('Renew the trade waste permit');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Renew the trade waste permit' }).click();
    const y = new Date();
    y.setDate(y.getDate() - 3);
    const iso = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    await page.locator('dialog[open]').getByLabel('Due').fill(iso);
    await page.locator('dialog[open]').getByRole('button', { name: 'Save' }).click();
    const overdue = page.getByRole('region', { name: 'Overdue' });
    await expect(overdue.getByText('Renew the trade waste permit')).toBeVisible();
    await expect(overdue.getByText(/^Was due /)).toBeVisible();
  });

  test('F11-H5 dictate a task with the mic button', async ({ page }) => {
    await onboard(page);
    await page.getByRole('link', { name: 'Tasks', exact: true }).click();
    await page.getByRole('button', { name: 'Dictate a task' }).click();
    await expect(page.getByLabel('New task')).toHaveValue(/short demo meeting/, { timeout: 10_000 });
    await page.getByRole('button', { name: 'Stop dictating' }).click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('region', { name: 'No date' }).getByText(/short demo meeting/)).toBeVisible();
  });

  test('F11-H6 dictate a quick note, save it, and make it a task', async ({ page }) => {
    await onboard(page);
    await page.goto('/#/quick');
    await page.getByRole('button', { name: 'Start dictating' }).click();
    await expect(page.getByLabel('Note')).toHaveValue(/short demo meeting/, { timeout: 10_000 });
    await page.getByRole('button', { name: 'Stop dictating' }).click();
    await page.getByRole('button', { name: 'Make it a task' }).click();
    await expect(page.getByText('Saved and added to Tasks')).toBeVisible();
    await page.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('region', { name: 'No date' }).getByText(/short demo meeting/)).toBeVisible();
    await page.goto('/#/history');
    await expect(page.getByText(/short demo meeting/)).toBeVisible();
  });

  test.describe('offline without the speech model', () => {
    test.use({ demoEngine: false, allowConsole: [/ERR_INTERNET_DISCONNECTED/] });
    test('F11-E2 the mic explains why it cannot listen, and typing still works', async ({ page, context }) => {
      await onboard(page);
      await context.setOffline(true);
      await page.goto('/#/quick');
      await page.getByRole('button', { name: 'Start dictating' }).click();
      await expect(page.getByRole('alert')).toContainText("speech model isn't downloaded");
      await page.getByLabel('Note').fill('Typed instead');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText('Note saved')).toBeVisible();
      await context.setOffline(false);
    });
  });

  test('F11-E3 home shows open tasks and opens the list', async ({ page }) => {
    await onboard(page, { samples: true });
    await page.getByRole('link', { name: /Open tasks/ }).click();
    await expect(page).toHaveURL(/#\/tasks/);
    await expect(page.getByText('Order more masking tape and sanding discs')).toBeVisible();
  });
});
