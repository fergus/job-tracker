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
    // The suite shares one server and one in-memory DB, so its requests all
    // land in the same rate-limit bucket. At the production default of 100 a
    // minute the run starts 429ing partway through and later specs fail on
    // setup rather than on anything they assert.
    command: `cd .. && PORT=${PORT} MCP_PORT=${Number(PORT) + 1} DB_PATH=:memory: NODE_ENV=test RATE_LIMIT_API=100000 RATE_LIMIT_UPLOADS=100000 node server/index.js`,
    url: `${baseURL}/api/me`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
