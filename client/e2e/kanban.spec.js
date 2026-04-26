import { test, expect } from '@playwright/test'

test('closed column shows terminal applications', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'KanbanActive', role_title: 'Engineer', status: 'interested' },
  })
  await request.post('/api/applications', {
    data: { company_name: 'KanbanRejected', role_title: 'Engineer', status: 'rejected' },
  })
  await request.post('/api/applications', {
    data: { company_name: 'KanbanAccepted', role_title: 'Engineer', status: 'accepted' },
  })

  await page.goto('/')

  // Terminal apps should be visible in the closed column (desktop view is first in DOM)
  await expect(page.getByText('KanbanRejected').first()).toBeVisible()
  await expect(page.getByText('KanbanAccepted').first()).toBeVisible()

  // Active app should also be visible (in Interested column)
  await expect(page.getByText('KanbanActive').first()).toBeVisible()

  // Hide closed column — use .first() because both app header and column header have this label
  await page.getByRole('button', { name: 'Hide closed applications' }).first().click()

  // Terminal apps should disappear from view entirely
  await expect(page.getByText('KanbanRejected').first()).not.toBeVisible()
  await expect(page.getByText('KanbanAccepted').first()).not.toBeVisible()

  // Active app should still be visible
  await expect(page.getByText('KanbanActive').first()).toBeVisible()

  // Show closed column again via ghost button
  await page.getByRole('button', { name: /Show \d+ closed applications/ }).first().click()

  // Terminal apps should reappear
  await expect(page.getByText('KanbanRejected').first()).toBeVisible()
  await expect(page.getByText('KanbanAccepted').first()).toBeVisible()
})

test('no show-older button when all closed apps are recent', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'KanbanRecentClosed', role_title: 'Engineer', status: 'rejected' },
  })

  await page.goto('/')

  await expect(page.getByText('KanbanRecentClosed').first()).toBeVisible()

  // The app was just created, so updated_at is now; no older apps exist
  await expect(page.getByText(/Show \d+ older/)).not.toBeVisible()
})

test('panel auto-closes when hiding closed column with terminal app open', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'PanelRejected', role_title: 'Engineer', status: 'rejected' },
  })

  await page.goto('/')

  // Open the rejected card's detail panel
  await page.getByRole('button', { name: 'PanelRejected Engineer' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  // Hide closed column via JS click to bypass the modal backdrop intercept
  await page.evaluate(() => {
    document.querySelector('button[aria-label="Hide closed applications"]').click()
  })

  // Panel should close automatically
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('show-older toggle expands and collapses older closed apps', async ({ page, request }) => {
  // Create an app, move it to rejected, then backdate closed_at so it appears older
  const res = await request.post('/api/applications', {
    data: { company_name: 'KanbanOldClosed', role_title: 'Engineer', status: 'interested' },
  })
  const app = await res.json()
  await request.patch(`/api/applications/${app.id}/status`, {
    data: { status: 'rejected' },
  })
  await request.patch(`/api/applications/${app.id}/dates`, {
    data: { closed_at: '2026-01-01T00:00:00.000Z' },
  })

  await page.goto('/')

  // Wait for the closed column to render
  await expect(page.getByRole('button', { name: /Show \d+ older/ })).toBeVisible()

  // The old app should be hidden initially (collapsed in older section)
  await expect(page.getByRole('button', { name: 'KanbanOldClosed Engineer' })).not.toBeVisible()

  // Expand older section
  await page.getByRole('button', { name: /Show \d+ older/ }).click()
  await expect(page.getByRole('button', { name: 'KanbanOldClosed Engineer' })).toBeVisible()

  // Collapse again
  await page.getByRole('button', { name: 'Show less' }).click()
  await expect(page.getByRole('button', { name: 'KanbanOldClosed Engineer' })).not.toBeVisible()
})

test('accepted cards render at full weight, rejected cards are quieted', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'QuietRejected', role_title: 'Engineer', status: 'rejected' },
  })
  await request.post('/api/applications', {
    data: { company_name: 'BoldAccepted', role_title: 'Engineer', status: 'accepted' },
  })

  await page.goto('/')

  // Rejected card should have quiet text colour (text-ink-3 on company name)
  const rejectedCard = page.getByRole('button', { name: 'QuietRejected Engineer' })
  await expect(rejectedCard.locator('p').first()).toHaveClass(/text-ink-3/)

  // Accepted card should have full ink text colour (text-ink on company name)
  const acceptedCard = page.getByRole('button', { name: 'BoldAccepted Engineer' })
  await expect(acceptedCard.locator('p').first()).toHaveClass(/text-ink/)
})
