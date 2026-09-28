import { test, expect } from '@playwright/test'
import { gotoPipeline } from './helpers.js'

// The suite shares one in-memory database across the run and does not isolate
// specs, so every name here is distinct, and assertions are scoped to this
// spec's own rows rather than to whole groups.

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// The browser's own calendar date, which the snooze offsets count from.
function localToday() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

async function seedApp(request, data) {
  const res = await request.post('/api/applications', {
    data: { role_title: 'Engineer', status: 'applied', ...data },
  })
  return res.json()
}

async function seedPerson(request, data) {
  const res = await request.post('/api/contacts', { data })
  return res.json()
}

// The server classifies against its own instance timezone, which need not be
// the browser's. Probe it with a throwaway record so seeded dates land in the
// group the test names.
async function serverToday(request) {
  const probe = localToday()
  const app = await seedApp(request, { company_name: 'TodayProbe', next_action_at: probe })
  await request.delete(`/api/applications/${app.id}`)
  return addDays(probe, -app.follow_up_days)
}

function group(page, label) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: label, exact: true }) })
}

async function openToday(page) {
  await page.goto('/')
  await page.waitForTimeout(400)
}

test('the app lands on Today', async ({ page }) => {
  await openToday(page)
  await expect(page.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'Board' })).toHaveCount(0)
})

test('roles, leads and people land in their groups, interleaved (AE1)', async ({ page, request }) => {
  const today = await serverToday(request)
  await seedApp(request, { company_name: 'TodayOverCo', next_action_at: addDays(today, -2), next_action: 'Chase the panel date' })
  await seedPerson(request, { name: 'Tamsin Ellery', employer: 'Hollow Talent', next_action_at: today })
  await seedApp(request, { company_name: 'TodayLeadCo', status: 'interested', next_action_at: addDays(today, 5) })
  await seedApp(request, { company_name: 'TodayFarCo', next_action_at: addDays(today, 9) })

  await openToday(page)

  await expect(group(page, 'Overdue').getByText('TodayOverCo')).toBeVisible()
  await expect(group(page, 'Overdue').getByText('Overdue by 2 days: Chase the panel date')).toBeVisible()
  await expect(group(page, 'Today').getByText('Tamsin Ellery')).toBeVisible()
  await expect(group(page, 'Today').getByText('Due today: Follow up').first()).toBeVisible()
  await expect(group(page, 'This week').getByText('TodayLeadCo')).toBeVisible()
  await expect(page.getByText('TodayFarCo')).toHaveCount(0)

  // The kind is stated in words, not by colour alone.
  await expect(page.getByRole('button', { name: /^Person\. Tamsin Ellery/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Lead\. TodayLeadCo/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Role\. TodayOverCo/ })).toBeVisible()
})

test('snoozing a person moves the date and logs nothing (AE4)', async ({ page, request }) => {
  const today = await serverToday(request)
  const person = await seedPerson(request, {
    name: 'Oswin Tarrant',
    next_action_at: addDays(today, -3),
    next_action: 'Send the deck',
    last_contacted_at: addDays(today, -30),
  })

  await openToday(page)
  await expect(group(page, 'Overdue').getByText('Oswin Tarrant')).toBeVisible()
  await page.getByRole('button', { name: 'Snooze Oswin Tarrant +1w' }).click()
  await page.waitForTimeout(500)

  const after = await (await request.get(`/api/contacts/${person.id}`)).json()
  expect(after.next_action_at).toBe(addDays(localToday(), 7))
  expect(after.next_action).toBe('Send the deck')
  expect(after.last_contacted_at).toBe(addDays(today, -30))
  expect(after.interactions).toHaveLength(0)
  await expect(group(page, 'Overdue').getByText('Oswin Tarrant')).toHaveCount(0)
})

test('snoozing a role moves it without counting as activity', async ({ page, request }) => {
  const today = await serverToday(request)
  const app = await seedApp(request, { company_name: 'TodaySnoozeCo', next_action_at: addDays(today, -1) })

  await openToday(page)
  await page.getByRole('button', { name: 'Snooze TodaySnoozeCo +1d' }).click()
  await page.waitForTimeout(500)

  const after = await (await request.get(`/api/applications/${app.id}`)).json()
  expect(after.next_action_at).toBe(addDays(localToday(), 1))
  expect(after.updated_at).toBe(app.updated_at)
  await expect(group(page, 'Overdue').getByText('TodaySnoozeCo')).toHaveCount(0)
})

test('a row opens the record or the person it is about', async ({ page, request }) => {
  const today = await serverToday(request)
  await seedApp(request, { company_name: 'TodayOpenCo', next_action_at: today })
  await seedPerson(request, { name: 'Wren Halloway', next_action_at: today })

  await openToday(page)
  await page.getByRole('button', { name: /^Role\. TodayOpenCo/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Close panel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: /^Person\. Wren Halloway/ }).click()
  await expect(page.getByRole('dialog', { name: 'Contact: Wren Halloway' })).toBeVisible()
})

test('closing a role from the board clears its step, and reopening does not bring it back (AE3)', async ({ page, request }) => {
  const today = await serverToday(request)
  const app = await seedApp(request, {
    company_name: 'TodayCloseCo',
    status: 'interview',
    next_action_at: addDays(today, -1),
    next_action: 'Chase feedback',
  })

  await gotoPipeline(page)
  const card = page.getByText('TodayCloseCo').first()
  const closedDropZone = page.getByTestId('closed-drop-zone')
  const from = await card.boundingBox()
  const to = await closedDropZone.boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(150)
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(
      from.x + from.width / 2 + ((to.x + to.width / 2 - (from.x + from.width / 2)) * step) / 10,
      from.y + from.height / 2 + ((to.y + to.height / 2 - (from.y + from.height / 2)) * step) / 10,
    )
    await page.waitForTimeout(20)
  }
  await page.mouse.up()
  await page.waitForTimeout(500)

  const closed = await (await request.get(`/api/applications/${app.id}`)).json()
  expect(closed.state).toBe('closed')
  expect(closed.next_action_at).toBeNull()
  expect(closed.next_action).toBeNull()

  await request.put(`/api/applications/${app.id}`, { data: { state: 'open' } })

  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await page.waitForTimeout(400)
  await expect(page.getByText('TodayCloseCo')).toHaveCount(0)
})
