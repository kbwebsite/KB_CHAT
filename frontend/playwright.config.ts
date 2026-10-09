// KRYZEN PE-2K — Playwright E2E foundation.
//
// Separate the tests that need a backend from the standalone landing smoke:
//   smoke -> e2e/landing.spec.ts (public page only)
//   e2e   -> everything else (authenticated/API flows)
//
// URLs and credentials are environment-configurable; nothing here depends on
// production accounts or data. The managed backend always boots against a
// fresh temp SQLite file (never reused, never the dev DB), so fixtures can
// create users freely. No tokens or passwords are ever logged.
import { defineConfig, devices } from '@playwright/test';
import * as os from 'node:os';
import * as path from 'node:path';

const FRONTEND_URL = process.env.KB_E2E_FRONTEND_URL ?? 'http://localhost:5173';
const BACKEND_URL = process.env.KB_E2E_BACKEND_URL ?? 'http://127.0.0.1:8000';
// Fresh database per run: no cross-run contamination, no cleanup of users.
const E2E_DB = path.join(os.tmpdir(), `kb-e2e-${Date.now()}.db`);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // single-flight against the temp sqlite backend
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: FRONTEND_URL,
    // Traces embed request/response bodies (tokens). Screenshots show only
    // synthetic test data, so screenshots are kept and traces stay off.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'smoke', testMatch: /landing\.spec\.ts/ },
    {
      name: 'e2e',
      testMatch: /.*\.spec\.ts/,
      testIgnore: /landing\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Managed backend: NEVER reuse an existing server — a reused dev
      // backend would point at the shared kbchat.db and tests would write
      // real rows there. The temp file below is created fresh per run.
      command: 'python -m uvicorn app.main:app --host 127.0.0.1 --port 8000',
      cwd: '../backend',
      url: `${BACKEND_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        DATABASE_URL: `sqlite:///${E2E_DB}`,
        APP_ENV: 'development',
        PATH: process.env.PATH ?? '',
      },
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
