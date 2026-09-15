import { test, expect } from '@playwright/test'

async function seedApp(request, company) {
  return request
    .post('/api/applications', {
      data: { company_name: company, role_title: 'Engineer', status: 'interested' },
    })
    .then((r) => r.json())
}

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// The server classifies against today in its instance timezone, which need not
// be the runner's. Ask it: write a probe date, read back how far away it thinks
// that is, then clear the probe. A follow-up-only PUT leaves updated_at alone.
async function serverDateInDays(request, appId, n) {
  const probe = new Date().toISOString().slice(0, 10)
  const probed = await request
    .put(`/api/applications/${appId}`, { data: { next_action_at: probe } })
    .then((r) => r.json())
  await request.put(`/api/applications/${appId}`, { data: { next_action_at: null } })
  return addDays(probe, n - probed.follow_up_days)
}

async function openPanel(page, company) {
  await page.goto('/')
  await page.getByText(company).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

test('setting a follow-up date from the panel states how soon it is due', async ({
  page,
  request,
}) => {
  const app = await seedApp(request, 'FollowSetCo')
  const target = await serverDateInDays(request, app.id, 3)

  const dialog = await openPanel(page, 'FollowSetCo')
  await dialog.getByRole('button', { name: 'Edit follow-up date' }).click()
  await dialog.getByLabel('Follow-up date', { exact: true }).fill(target)

  await expect(dialog.getByText('Due in 3 days', { exact: true })).toBeVisible()

  const saved = await request.get(`/api/applications/${app.id}`).then((r) => r.json())
  expect(saved.next_action_at).toBe(target)
  expect(saved.follow_up_state).toBe('upcoming')
  expect(saved.follow_up_days).toBe(3)
})

test('clearing the follow-up date removes it from the panel and the record', async ({
  page,
  request,
}) => {
  const app = await seedApp(request, 'FollowClearCo')
  await request.put(`/api/applications/${app.id}`, { data: { next_action_at: '2099-04-01' } })

  const dialog = await openPanel(page, 'FollowClearCo')
  await expect(dialog.getByText(/^Due in \d+ days$/)).toBeVisible()

  await dialog.getByRole('button', { name: 'Edit follow-up date' }).click()
  await dialog.getByRole('button', { name: 'Clear follow-up date' }).click()

  await expect(dialog.getByText(/^Due in \d+ days$/)).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Edit follow-up date' })).toHaveText('-')

  const saved = await request.get(`/api/applications/${app.id}`).then((r) => r.json())
  expect(saved.next_action_at).toBe(null)
  expect(saved.follow_up_state).toBe(null)
  expect(saved.follow_up_days).toBe(null)
})

test('setting and clearing the follow-up date leaves updated_at alone', async ({
  page,
  request,
}) => {
  const app = await seedApp(request, 'FollowStaleCo')
  const before = await request.get(`/api/applications/${app.id}`).then((r) => r.json())

  const dialog = await openPanel(page, 'FollowStaleCo')
  await dialog.getByRole('button', { name: 'Edit follow-up date' }).click()
  await dialog.getByLabel('Follow-up date', { exact: true }).fill('2099-05-01')
  await expect(dialog.getByText(/^Due in \d+ days$/)).toBeVisible()

  await dialog.getByRole('button', { name: 'Edit follow-up date' }).click()
  await dialog.getByRole('button', { name: 'Clear follow-up date' }).click()
  await expect(dialog.getByText(/^Due in \d+ days$/)).toHaveCount(0)

  const after = await request.get(`/api/applications/${app.id}`).then((r) => r.json())
  expect(after.next_action_at).toBe(null)
  expect(after.updated_at).toBe(before.updated_at)
})

test('a failed follow-up save says so and leaves the date as it was', async ({
  page,
  request,
}) => {
  const app = await seedApp(request, 'FollowFailCo')
  await request.put(`/api/applications/${app.id}`, { data: { next_action_at: '2099-06-01' } })

  const dialog = await openPanel(page, 'FollowFailCo')
  const display = dialog.getByRole('button', { name: 'Edit follow-up date' })
  const prose = dialog.getByText(/^Due in \d+ days$/)
  await expect(prose).toBeVisible()
  const shownDate = await display.textContent()
  const shownProse = await prose.textContent()

  // Fail only the write; the detail GET behind the same URL still has to load.
  await page.route(`**/api/applications/${app.id}`, (route) => {
    if (route.request().method() === 'PUT') {
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"nope"}' })
    }
    return route.continue()
  })

  await display.click()
  await dialog.getByLabel('Follow-up date', { exact: true }).fill('2099-07-01')

  await expect(page.getByText(/Error updating follow-up date/)).toBeVisible()
  await expect(display).toHaveText(shownDate)
  await expect(dialog.getByText(shownProse, { exact: true })).toBeVisible()

  const after = await request.get(`/api/applications/${app.id}`).then((r) => r.json())
  expect(after.next_action_at).toBe('2099-06-01')
})
