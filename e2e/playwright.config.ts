// The e2e suite: the web export against the real API and a real Postgres, set up once by the
// global setup. One worker and no parallelism, because the specs share one API and one database.
import { defineConfig, devices } from '@playwright/test';

import { BASE_PATH, webOrigin } from './support/e2eEnv';

const TEST_TIMEOUT_MS = 90_000;
const EXPECT_TIMEOUT_MS = 15_000;

export default defineConfig({
  expect: { timeout: EXPECT_TIMEOUT_MS },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  globalSetup: './global-setup.ts',
  outputDir: '../test-results',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  retries: 0,
  testDir: './specs',
  timeout: TEST_TIMEOUT_MS,
  use: {
    baseURL: `${webOrigin}${BASE_PATH}/`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  workers: 1,
});
