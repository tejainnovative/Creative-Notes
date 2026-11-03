import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Runs against the local dev server and the mock API. Uses the installed Chrome
// (no browser download) with a fake microphone. Group policy blocks npx here, so run:
//   node node_modules/@playwright/test/cli.js test      (or: npm run test:e2e)
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 3,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome',
    permissions: ['microphone'],
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'phone', testIgnore: '**/whisper/**', use: { viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true } },
    { name: 'desktop', testIgnore: '**/whisper/**', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } } },
    // Real on-device speech: downloads the Whisper model once (~58 MB) and feeds a speech clip as the mic.
    // Run on its own: npm run test:whisper
    {
      name: 'whisper',
      testMatch: '**/whisper/**/*.spec.ts',
      use: {
        viewport: { width: 390, height: 844 },
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${resolve('e2e/fixtures/jfk.wav')}`],
        },
      },
    },
  ],
  webServer: [
    { command: 'node server/src/dev.ts --mock', url: 'http://127.0.0.1:8787/api/health', reuseExistingServer: true },
    { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
  ],
});
