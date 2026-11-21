import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    viewport: { width: 1440, height: 900 },
  },
  // Chrome/Edge, Firefox and Safari's engine. `npm run test:e2e` runs Chromium only (fast);
  // `npm run test:e2e:all` runs all three, and CI runs Firefox and WebKit in their own job.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 900 },
        // lets tests read the clipboard without Firefox's "Paste" prompt
        launchOptions: { firefoxUserPrefs: { 'dom.events.testing.asyncClipboard': true } },
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
