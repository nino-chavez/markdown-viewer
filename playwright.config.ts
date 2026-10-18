import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir: 'tests', testMatch: '*.e2e.ts', workers: 1, timeout: 30000, reporter: 'list',
  webServer: process.env.VIEWER_BASE_URL ? undefined : {
    command: 'node tests/serve-pwa.mjs',
    url: `http://127.0.0.1:${process.env.PWA_TEST_PORT || 4179}`,
    reuseExistingServer: false,
  },
});
