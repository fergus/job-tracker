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
