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
        stage: 'applied',
        next_action_at: '2099-01-01',
        next_action: 'Send references',
      },
    })
    .then((r) => r.json())
  await request.put(`/api/applications/${app.id}`, {
    data: { state: 'closed', close_reason: 'rejected' },
  })

  const closed = await (await request.get(`/api/applications/${app.id}`)).json()
  expect(closed.state).toBe('closed')
  expect(closed.next_action).toBe('Send references')
  expect(closed.next_action_at).toBe('2099-01-01')
})

test('a phone-only key is created once, marked in the list, and revocable', async ({
  page,
  request,
}) => {
  await openSettings(page)
  await expect(page.getByRole('heading', { name: 'iPhone contacts' })).toBeVisible()
  await expect(page.getByText(new RegExp(`Server:.*${new URL(page.url()).host}`))).toBeVisible()
  await expect(page.getByText(/Use an https address/)).toBeVisible()

  await page.getByRole('button', { name: 'Create phone key' }).click()
  const dialog = page.getByRole('dialog', { name: 'API key generated' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Phone Key Generated')).toBeVisible()
  const key = (await dialog.locator('code').innerText()).trim()
  expect(key).toMatch(/^[0-9a-f]{64}$/)

  // The key it shows really is phone-only: the REST API refuses it.
  const rest = await request.get('/api/applications', {
    headers: { Authorization: `Bearer ${key}` },
  })
  expect(rest.status()).toBe(401)

  await dialog.getByRole('button', { name: "I've saved this key" }).click()
  await expect(page.getByRole('button', { name: 'Create phone key' })).toBeFocused()

  const row = page.getByRole('listitem').filter({ hasText: 'iPhone contacts' })
  await expect(row.getByText('Phone only')).toBeVisible()

  await row.getByRole('button', { name: 'Revoke' }).click()
  await row.getByRole('button', { name: 'Yes' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'iPhone contacts' })).toHaveCount(0)
})
