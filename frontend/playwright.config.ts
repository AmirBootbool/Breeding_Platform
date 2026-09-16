import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  // Global timeout: 10 minutes – accommodates the full 7-generation breeding cycle
  timeout: 600_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // Record video for every test so the full pipeline can be reviewed visually
    video: 'on',
    // Slightly slower actions make the run more robust on slower CI machines
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
