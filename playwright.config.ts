import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: 'tests/browser',
  outputDir: join(tmpdir(), 'e6tz-integration-playwright-results'),
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5600',
    headless: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:5600',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
