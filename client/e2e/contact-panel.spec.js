import { test, expect } from '@playwright/test'

// Open the contact drawer from the record it is linked to, which is the only
// route into it: there is no contacts list view.
async function openContactPanel(page, request, { company, person }) {
  const app = await request
    .post('/api/applications', {
      data: { company_name: company, role_title: 'Engineer', status: 'interested' },
    })
    .then((r) => r.json())
  const contact = await request
    .post('/api/contacts', { data: { name: person, contact_role: 'recruiter' } })
    .then((r) => r.json())
  await request.post(`/api/contacts/${contact.id}/links`, {
    data: { application_id: app.id },
  })

  await page.goto('/')
  await page.getByText(company).first().click()
  await page.getByRole('button', { name: `Open ${person}` }).click()
  await expect(page.getByRole('dialog', { name: `Contact: ${person}` })).toBeVisible()
  return { app, contact }
}

test('setting a next touch from the panel makes the contact queryable', async ({
  page,
  request,
}) => {
  const { contact } = await openContactPanel(page, request, {
    company: 'PanelCo',
    person: 'Dana Reed',
  })

  await page.getByLabel('Next touch date', { exact: true }).fill('2099-01-15')
  await page.getByLabel('Next touch action', { exact: true }).fill('Chase the shortlist')
  await page.getByRole('button', { name: 'Save contact' }).click()

  await expect(page.getByText(/Due in \d+ days: Chase the shortlist/)).toBeVisible()

  // The point of the field: it is a query, not just a label on a card.
  const due = await request
    .get('/api/contacts?has_next_action=true')
    .then((r) => r.json())
  const saved = due.find((c) => c.id === contact.id)
  expect(saved.next_action_at).toBe('2099-01-15')
  expect(saved.next_action).toBe('Chase the shortlist')
  expect(saved.follow_up_state).toBe('upcoming')
})

test('the record panel flags which linked people are owed a touch', async ({
  page,
  request,
}) => {
  const app = await request
    .post('/api/applications', {
      data: { company_name: 'ChipCo', role_title: 'Engineer', status: 'interested' },
    })
    .then((r) => r.json())
  const overdue = await request
    .post('/api/contacts', {
      data: { name: 'Late Larry', next_action_at: '2020-01-01', next_action: 'Ring back' },
    })
    .then((r) => r.json())
  const quiet = await request
    .post('/api/contacts', { data: { name: 'Quiet Quinn' } })
    .then((r) => r.json())
  for (const c of [overdue, quiet]) {
    await request.post(`/api/contacts/${c.id}/links`, {
      data: { application_id: app.id },
    })
  }

  await page.goto('/')
  await page.getByText('ChipCo').first().click()

  await expect(page.getByText(/\d+d overdue/)).toBeVisible()
  // Someone with no commitment gets no chip, so the flag means something.
  const quinnRow = page.locator('li', { hasText: 'Quiet Quinn' })
  await expect(quinnRow.getByText(/overdue|due today|in \d+d/)).toHaveCount(0)
})

test('logging an interaction records it and can re-date the next touch', async ({
  page,
  request,
}) => {
  const { contact } = await openContactPanel(page, request, {
    company: 'LogCo',
    person: 'Sam Okafor',
  })

  await page.getByLabel('What happened', { exact: true }).fill('Called about the role')
  await page.getByLabel('Interaction date', { exact: true }).fill('2026-08-14')
  await page.getByLabel('and set the next touch', { exact: true }).check()
  await page.getByLabel('Logged next touch date', { exact: true }).fill('2099-02-01')
  await page.getByLabel('Logged next touch action', { exact: true }).fill('Send the CV')
  await page.getByRole('button', { name: 'Log it' }).click()

  await expect(page.getByText('Called about the role')).toBeVisible()
  await expect(page.getByText(/Last contacted/)).toBeVisible()

  const saved = await request.get(`/api/contacts/${contact.id}`).then((r) => r.json())
  expect(saved.interactions).toHaveLength(1)
  expect(saved.last_contacted_at).toBe('2026-08-14')
  expect(saved.next_action_at).toBe('2099-02-01')
  expect(saved.next_action).toBe('Send the CV')
})

test('clearing the commitment removes it rather than blanking the display', async ({
  page,
  request,
}) => {
  const app = await request
    .post('/api/applications', {
      data: { company_name: 'ClearCo', role_title: 'Engineer', status: 'interested' },
    })
    .then((r) => r.json())
  const contact = await request
    .post('/api/contacts', {
      data: { name: 'Ada Vance', next_action_at: '2099-03-01', next_action: 'Ring back' },
    })
    .then((r) => r.json())
  await request.post(`/api/contacts/${contact.id}/links`, {
    data: { application_id: app.id },
  })

  await page.goto('/')
  await page.getByText('ClearCo').first().click()
  await page.getByRole('button', { name: 'Open Ada Vance' }).click()

  await expect(page.getByText(/Ring back/)).toBeVisible()
  await page.getByRole('button', { name: 'Clear the commitment' }).click()
  await page.getByRole('button', { name: 'Save contact' }).click()

  await expect(page.getByText(/Ring back/)).not.toBeVisible()
  const saved = await request.get(`/api/contacts/${contact.id}`).then((r) => r.json())
  expect(saved.next_action_at).toBe(null)
  expect(saved.next_action).toBe(null)
  expect(saved.follow_up_state).toBe(null)
})
