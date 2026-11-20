import { defineConfig, devices } from '@playwright/test';

const PORT = 8081;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}/`, locale: 'he-IL' },
  webServer: {
    command: 'node scripts/serve.mjs',
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 5'], defaultBrowserType: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // דפדפנים נוספים (npm run test:browsers). דורש: npx playwright install webkit firefox
    ...(process.env.ALL_BROWSERS
      ? [
          { name: 'iphone-safari', use: { ...devices['iPhone 13'] } },
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        ]
      : []),
  ],
});
