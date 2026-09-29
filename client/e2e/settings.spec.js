import { test, expect } from '@playwright/test'

// Every spec runs as the same dev user, so a setting left off here would change
// what closing does in every later spec. Put it back whatever happens.
test.afterEach(async ({ request }) => {
  await request.put('/api/me/settings', { data: { clear_next_step_on_close: true } })
})

async function openSettings(page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open settings' }).click()
  const toggle = page.getByRole('switch', { name: 'Clear the next step when a record closes' })
  await expect(toggle).toBeEnabled()
  return toggle
}

test('the clear-on-close switch defaults on and saves when flipped', async ({ page, request }) => {
  const toggle = await openSettings(page)
  await expect(toggle).toHaveAttribute('aria-checked', 'true')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  const saved = await (await request.get('/api/me/settings')).json()
  expect(saved.clear_next_step_on_close).toBe(false)
})

test('with the switch off, closing a role keeps its next step', async ({ page, request }) => {
  const toggle = await openSettings(page)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')

  const app = await request
    .post('/api/applications', {
      data: {
        company_name: 'KeepStepCo',
        role_title: 'Engineer',
        status: 'applied',
        next_action_at: '2099-01-01',
        next_action: 'Send references',
      },
    })
    .then((r) => r.json())
  await request.patch(`/api/applications/${app.id}/status`, { data: { status: 'rejected' } })

  const closed = await (await request.get(`/api/applications/${app.id}`)).json()
  expect(closed.state).toBe('closed')
  expect(closed.next_action).toBe('Send references')
  expect(closed.next_action_at).toBe('2099-01-01')
})
