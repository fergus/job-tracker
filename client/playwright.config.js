import { defineConfig, devices } from '@playwright/test'

const PORT = process.env.TEST_PORT || 3456
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `cd .. && PORT=${PORT} MCP_PORT=${Number(PORT) + 1} DB_PATH=:memory: NODE_ENV=test node server/index.js`,
    url: `${baseURL}/api/me`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
