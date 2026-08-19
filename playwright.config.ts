import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    // Chromium only: the File System Access API and cross-origin isolation
    // behave differently elsewhere, and this is what schools deploy.
    launchOptions: {
      args: ['--no-sandbox'],
      // Escape hatch for sandboxes that ship a pre-installed Chromium whose
      // build number does not match this @playwright/test version.
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
        : {}),
    },
  },
  webServer: {
    command: 'PORT=3100 node server.mjs',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
