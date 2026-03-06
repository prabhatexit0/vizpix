import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'off',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
