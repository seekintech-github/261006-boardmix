import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const chromiumExecutable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (process.platform === 'linux' && existsSync('/usr/bin/chromium')
    ? '/usr/bin/chromium'
    : undefined);

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 1000 },
    baseURL: 'http://127.0.0.1:5173',
    launchOptions: { executablePath: chromiumExecutable },
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
