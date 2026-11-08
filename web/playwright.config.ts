import { defineConfig, devices } from '@playwright/test';

// Visual checks against the design: desktop 1440 and phone 390 (docs/website-brief.md §8).
export default defineConfig({
  testDir: 'tests/visual',
  outputDir: 'tests/visual/.results',
  snapshotPathTemplate: '{testDir}/__screens__/{testFilePath}/{arg}-{projectName}{ext}',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
