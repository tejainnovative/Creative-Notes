import { test, expect, onboard, startRecording, OFFLINE_NOISE, a11y } from '../fixtures';

// Runs in the "whisper" project only: Chrome's fake microphone plays e2e/fixtures/jfk.wav
// (a public-domain 11 s speech clip, looped), and the real Whisper model is downloaded once.
test.use({ demoEngine: false, allowConsole: [OFFLINE_NOISE] });
test.setTimeout(6 * 60_000);

test('F10-H2 real speech is transcribed on the device with the network off', async ({ page, context }) => {
  const remote: string[] = [];
  const downloads: string[] = [];
  page.on('request', (r) => downloads.push(new URL(r.url()).host + new URL(r.url()).pathname));
  await onboard(page);

  // Download the model while online (S13).
  await page.goto('/#/settings/offline');
  await page.getByRole('button', { name: 'Download speech model' }).click();
  await expect(page.getByRole('progressbar', { name: 'Downloading the speech model' })).toBeVisible();
  await expect(page.getByText('Ready. Works with no connection.')).toBeVisible({ timeout: 5 * 60_000 });
  await a11y(page, 'S13 Offline, model ready');
  // The runtime comes from this app, never a CDN; the model only from the pinned Hugging Face commit.
  expect(downloads.filter((u) => /jsdelivr|unpkg|cdnjs/.test(u))).toEqual([]);
  expect(downloads.some((u) => u.includes('/ort/ort-wasm-simd-threaded.wasm'))).toBe(true);
  expect(downloads.filter((u) => u.startsWith('huggingface.co') && !u.includes('ff4177021cc41f7db950912b73ea4fdf7d01d8e7'))).toEqual([]);
  // Reopening the screen still finds the model in the cache.
  await page.goto('/#/settings');
  await page.goto('/#/settings/offline');
  await expect(page.getByText('Ready. Works with no connection.')).toBeVisible();

  // From here nothing may leave the device.
  await context.setOffline(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname !== '127.0.0.1' && u.protocol.startsWith('http')) remote.push(u.hostname);
  });
  await page.goto('/#/');
  await startRecording(page);
  await expect(page.getByText('On device')).toBeVisible();

  const transcript = page.getByRole('list', { name: 'Transcript' });
  // The speaker pauses after "ask not", so the words may span two transcript lines.
  await expect(transcript).toContainText(/ask not\W*(\d\d:\d\d)?\W*what your country can do for you/i, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Stop recording' }).click();

  // The clean-up pass re-reads the kept audio, replaces the live transcript, then deletes the audio.
  const audioLeft = () => page.evaluate(() => new Promise<number>((res, rej) => {
    const r = indexedDB.open('creative-notes');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const q = r.result.transaction('audio').objectStore('audio').count();
      q.onsuccess = () => { res(q.result); r.result.close(); };
    };
  }));
  await expect.poll(audioLeft, { timeout: 180_000, intervals: [1000] }).toBe(0);
  await expect(page.getByText(/Cleaning up the transcript|cleaned up on this device/)).toHaveCount(0);
  await expect(page.getByText(/written when you're back online/)).toBeVisible();
  await page.getByRole('tab', { name: 'Transcript' }).click();
  const cleaned = page.getByRole('list', { name: 'Transcript' });
  // Whole windows, cut at pauses: the sentence is no longer split across lines.
  await expect(cleaned).toContainText(/ask not what your country can do for you/i);
  expect(remote, 'requests that left the device while offline').toEqual([]);
});

test('F10-E2 offline without the model: says so and points to the download', async ({ page, context }) => {
  await onboard(page);
  await context.setOffline(true);
  await startRecording(page);
  await expect(page.getByText(/speech model isn't downloaded/)).toBeVisible();
  await page.getByRole('button', { name: 'Stop recording' }).click();
});
