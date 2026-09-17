import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/backend/**/*.test.ts'],
    setupFiles: ['src/backend/tests/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 20000,
  },
});
