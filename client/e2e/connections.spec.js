import { test, expect } from '@playwright/test'

// Every spec shares one dev user, so imported connections left behind would
// change what Today says in every later spec. Clear them whatever happens.
test.afterEach(async ({ request }) => {
  await request.delete('/api/connections')
})

const CSV = [
  'Notes:',
  '"Some addresses are missing from this export."',
  '',
  'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
  'Jo,Fennimore,https://www.linkedin.com/in/jo-fennimore,,Fennimore Labs Pty Ltd,Staff Engineer,23 Oct 2026',
  'Sam,Okonkwo-Reyes,https://www.linkedin.com/in/sam-okonkwo,,FENNIMORE LABS,Recruiter,01 Jan 2025',
  'Hidden,Person,,,Fennimore Labs,Secret,01 Jan 2025',
].join('\n')

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

test('importing connections surfaces them on Today and in the record panel', async ({ page, request }) => {
  const app = await (
    await request.post('/api/applications', {
      data: {
        company_name: 'Fennimore Labs',
        role_title: 'Platform Engineer',
        stage: 'applied',
        next_action_at: tomorrow(),
        next_action: 'Check in',
      },
    })
  ).json()

  // Import through Settings, as a user would.
  await page.goto('/')
  await page.getByRole('button', { name: 'Open settings' }).click()
  await page.getByTestId('connection-file').setInputFiles({
    name: 'Connections.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV),
  })
  await expect(page.getByTestId('connection-total')).toContainText('2 connections imported')
  await expect(page.getByText('2 added, 0 updated, 1 skipped')).toBeVisible()
  await page.getByRole('button', { name: /close settings/i }).click()

  // Today says who is known there.
  await page.goto('/')
  const row = page.getByRole('button', { name: /^Role\. Fennimore Labs.*You know 2 people here/ })
  await expect(row).toBeVisible()

  // The panel lists them, and one click makes a person of one.
  await row.click()
  const block = page.getByTestId('connections-block')
  await expect(block).toContainText('You know 2 people at Fennimore Labs')
  await block.getByRole('button', { name: 'Add Jo Fennimore as a person on this record' }).click()
  await expect(block.getByRole('button', { name: /Open Jo Fennimore, already on your people list/ })).toBeVisible()

  const contacts = await (await request.get('/api/contacts')).json()
  const jo = contacts.find((c) => c.name === 'Jo Fennimore')
  expect(jo).toBeTruthy()
  expect(jo.employer).toBe('Fennimore Labs Pty Ltd')
  await request.delete(`/api/contacts/${jo.id}`)
  await request.delete(`/api/applications/${app.id}`)
})

test('a file that is not a connections export is rejected with a reason', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open settings' }).click()
  await page.getByTestId('connection-file').setInputFiles({
    name: 'wrong.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('a,b\n1,2\n'),
  })
  await expect(page.getByRole('alert').filter({ hasText: 'Connections.csv' })).toBeVisible()
})
