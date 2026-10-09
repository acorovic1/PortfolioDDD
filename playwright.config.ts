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
  reporter: 'list',
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
      env: { DISABLE_RATE_LIMIT: 'true' },
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
