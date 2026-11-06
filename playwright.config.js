import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '**/*.spec.js',
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  projects: [{ name: 'chromium' }],
});
