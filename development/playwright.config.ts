import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/e2e', timeout: 30000, workers: 1, use: { baseURL: 'http://127.0.0.1:4319', viewport: { width: 1920, height: 1080 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/preview.mjs', url: 'http://127.0.0.1:4319', reuseExistingServer: false } });
