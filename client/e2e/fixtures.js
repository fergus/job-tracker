// Every spec imports `test` and `expect` from here, not from @playwright/test
// (eslint enforces it), so every test runs under the console guard.
//
// The guard fails a test that logs a console error or throws an uncaught page
// error, which is how a CSP violation, a broken asset or a runtime exception
// surfaces in the browser. A test that triggers one on purpose -- a forced 500
// to check the failure toast, say -- declares it first:
//
//   test('...', async ({ page, consoleGuard }) => {
//     consoleGuard.allow(/status of 500/)
import { test as base, expect } from '@playwright/test'

export { expect }

export const test = base.extend({
  consoleGuard: [
    async ({ page }, use) => {
      const allowed = []
      const seen = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') seen.push(`console.error: ${msg.text()}`)
      })
      page.on('pageerror', (err) => seen.push(`pageerror: ${err.message}`))

      await use({ allow: (pattern) => allowed.push(pattern) })

      const unexpected = seen.filter((line) => !allowed.some((p) => p.test(line)))
      expect(unexpected, 'unexpected browser errors').toEqual([])
    },
    { auto: true },
  ],
})
