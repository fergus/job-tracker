import { test, expect } from '@playwright/test'

// The suite shares one in-memory database across the run and does not isolate
// specs, so every name here is distinct from the ones contact-panel.spec.js
// seeds. Otherwise a group assertion picks up someone else's fixture.
const today = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const shift = (days) => {
  const d = new Date(`${today()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function seed(request, contacts) {
  const made = []
  for (const c of contacts) {
    const res = await request.post('/api/contacts', { data: c })
    made.push(await res.json())
  }
  return made
}

async function openPeople(page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'People' }).click()
  // The section crossfades in; the same short settle the view specs use.
  await page.waitForTimeout(400)
}

test('an inline snooze moves the commitment and nothing else', async ({ page, request }) => {
  const [person] = await seed(request, [
    {
      name: 'Sunniva Kalb',
      employer: 'Ashgrove Talent',
      next_action_at: shift(-4),
      next_action: 'Chase the intro',
      last_contacted_at: shift(-40),
    },
  ])

  await openPeople(page)
  await expect(page.getByText('Sunniva Kalb')).toBeVisible()

  await page.getByRole('button', { name: 'Snooze Sunniva Kalb +1w' }).click()
  await page.waitForTimeout(500)

  const after = await (await request.get(`/api/contacts/${person.id}`)).json()
  expect(after.next_action_at).toBe(shift(7))
  expect(after.next_action).toBe('Chase the intro')
  expect(after.last_contacted_at).toBe(shift(-40))
  expect(after.interactions).toHaveLength(0)

  // R13/KTD4: the row re-groups because the list refetched, not because the
  // client moved it optimistically.
  await expect(page.getByText(/Due in 7 days: Chase the intro/)).toBeVisible()
})

test('switching to People works from either lens, and back again', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'People' }).click()
  await page.waitForTimeout(400)
  await expect(page.getByRole('button', { name: 'People' })).toHaveAttribute('aria-current', 'page')
  // R20: People renders no lens control.
  await expect(page.getByRole('button', { name: 'Timeline' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Applications', exact: true }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Timeline' }).click()
  await page.waitForTimeout(400)

  await page.getByRole('button', { name: 'People' }).click()
  await page.waitForTimeout(400)
  await expect(page.getByRole('button', { name: 'People' })).toHaveAttribute('aria-current', 'page')

  // R20 again: returning to Applications restores the lens the user left on.
  await page.getByRole('button', { name: 'Applications', exact: true }).click()
  await page.waitForTimeout(400)
  await expect(page.getByRole('button', { name: 'Board' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-current', 'true')
})

test('groups render in order, with the quiet ranked above the never-contacted', async ({ page, request }) => {
  await seed(request, [
    { name: 'Odalys Prynne', employer: 'Fenwick Search', next_action_at: shift(-6), next_action: 'Return the call' },
    { name: 'Teodor Blaha', employer: 'Lakebridge', next_action_at: today(), next_action: 'Confirm the panel time' },
    { name: 'Wren Castellan', employer: 'Marrow & Co', next_action_at: shift(9), next_action: 'Send the deck' },
    { name: 'Faustine Oyelaran', employer: 'Pellucid', last_contacted_at: shift(-200) },
    { name: 'Greger Halloway', employer: 'Underhill Partners', last_contacted_at: shift(-25) },
    { name: 'Nkechi Sorabji', employer: 'Quillon' },
  ])

  await openPeople(page)

  const headings = page.getByRole('heading', { level: 2 })
  await expect(headings).toHaveText([/Overdue/, /Today/, /Upcoming/, /No commitment/])

  const noCommitment = page.locator('section').filter({ hasText: 'No commitment' })
  const rows = noCommitment.getByRole('button')
  await expect(rows.filter({ hasText: 'Faustine Oyelaran' })).toBeVisible()

  // R5/R6: longest-quiet first, never-contacted at the bottom of the group.
  const names = await rows.allInnerTexts()
  const seen = names.join(' | ')
  expect(seen.indexOf('Faustine Oyelaran')).toBeLessThan(seen.indexOf('Greger Halloway'))
  expect(seen.indexOf('Greger Halloway')).toBeLessThan(seen.indexOf('Nkechi Sorabji'))

  // R7: the quiet group carries no badge, warning or count -- elapsed time and
  // position are the only signals a row carries.
  await expect(
    rows.filter({ hasText: 'Nkechi Sorabji' }).getByText('Never contacted'),
  ).toBeVisible()
  await expect(headings.filter({ hasText: /No commitment \(/ })).toHaveCount(0)
})

test('clicking a row opens the contact drawer', async ({ page, request }) => {
  await seed(request, [
    { name: 'Ludovica Aumonier', employer: 'Bellweather', last_contacted_at: shift(-12) },
  ])

  await openPeople(page)
  await page.getByRole('button', { name: /Ludovica Aumonier/ }).first().click()

  await expect(page.getByRole('heading', { name: 'Ludovica Aumonier' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Next touch' })).toBeVisible()
})

test('a person added here lands in the group their next action implies', async ({ page }) => {
  await openPeople(page)

  await page.getByRole('button', { name: '+ Add person' }).click()
  await page.getByLabel('Name').fill('Casimir Thorbecke')
  await page.getByLabel('Employer').fill('Vantage Reach')
  await page.locator('#people-new-next-at').fill(shift(5))
  await page.locator('#people-new-next').fill('Follow up on the referral')
  await page.getByRole('button', { name: 'Add person' }).click()
  await page.waitForTimeout(500)

  const upcoming = page.locator('section').filter({ hasText: 'Upcoming' })
  await expect(upcoming.getByText('Casimir Thorbecke')).toBeVisible()
  await expect(page.getByText(/Due in 5 days: Follow up on the referral/)).toBeVisible()
})

test('a person added with no next action sorts into No commitment', async ({ page }) => {
  await openPeople(page)

  await page.getByRole('button', { name: '+ Add person' }).click()
  await page.getByLabel('Name').fill('Perpetua Vandersteen')
  await page.getByRole('button', { name: 'Add person' }).click()
  await page.waitForTimeout(500)

  const noCommitment = page.locator('section').filter({ hasText: 'No commitment' })
  await expect(noCommitment.getByText('Perpetua Vandersteen')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Perpetua Vandersteen.*Never contacted/ }),
  ).toBeVisible()
})

test('a blank name is refused before a request is made', async ({ page }) => {
  await openPeople(page)

  let posted = 0
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/contacts')) posted++
  })

  await page.getByRole('button', { name: '+ Add person' }).click()
  await page.getByLabel('Name').fill('   ')
  await expect(page.getByRole('button', { name: 'Add person' })).toBeDisabled()
  await page.waitForTimeout(200)
  expect(posted).toBe(0)
})

test('a failed snooze leaves the row where it is and says so', async ({ page, request }) => {
  const [person] = await seed(request, [
    {
      name: 'Bartholomew Quist',
      employer: 'Ravensmoor',
      next_action_at: shift(-3),
      next_action: 'Send the follow-up note',
    },
  ])

  await openPeople(page)
  await page.route(`**/api/contacts/${person.id}`, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"nope"}' }),
  )

  await page.getByRole('button', { name: 'Snooze Bartholomew Quist +1d' }).click()
  await page.waitForTimeout(500)

  await expect(page.getByText(/Failed to reschedule/)).toBeVisible()
  // R24: no optimistic move — the row still reads as overdue.
  await expect(page.getByText(/Overdue by 3 days: Send the follow-up note/)).toBeVisible()

  const after = await (await request.get(`/api/contacts/${person.id}`)).json()
  expect(after.next_action_at).toBe(shift(-3))
})

test('a second snooze is ignored while the first is in flight', async ({ page, request }) => {
  const [person] = await seed(request, [
    { name: 'Cordelia Shanklin', employer: 'Winterbourne', next_action_at: shift(-2), next_action: 'Ring back' },
  ])

  await openPeople(page)

  let writes = 0
  await page.route(`**/api/contacts/${person.id}`, async (route) => {
    if (route.request().method() === 'PUT') {
      writes++
      await new Promise((r) => setTimeout(r, 800))
    }
    await route.continue()
  })

  const first = page.getByRole('button', { name: 'Snooze Cordelia Shanklin +1d' })
  const second = page.getByRole('button', { name: 'Snooze Cordelia Shanklin +1w' })
  await first.click()
  await expect(second).toBeDisabled()
  await page.waitForTimeout(1200)

  expect(writes).toBe(1)
})
