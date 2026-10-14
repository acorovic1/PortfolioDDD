import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  // Some specs load real GLTF models over the network in sequence; under a
  // fully loaded machine (e.g. the whole suite running at once) a page load
  // can occasionally exceed even a generous timeout though the app itself
  // is fine - one retry absorbs that without masking a genuinely broken test.
  retries: 1,
  // On GitHub Actions (CI=true) failures also show up as annotations on the
  // run's page, readable without opening the logs.
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  // CI machines have no GPU: Chromium renders WebGL in software there, so the
  // 3D pages (landing hero, login backdrop, portfolio scene) run several
  // times slower than on a desktop. Same tests, more time.
  timeout: process.env.CI ? 90_000 : 30_000,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: [
    {
      command: 'npx ts-node src/backend/server.ts',
      port: 3001,
      // Every test runs from one IP; production rate limits would trip.
      // Empty SMTP settings keep the tests from sending real email through
      // the account in .env (dotenv doesn't override variables already set).
      env: { DISABLE_RATE_LIMIT: 'true', SMTP_URL: '', SMTP_HOST: '' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // Must match CORS_ORIGIN in .env (default http://localhost:5173) or the
      // browser's real fetch calls get CORS-blocked - this bit the first run.
      command: 'npx vite --port 5173',
      port: 5173,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
