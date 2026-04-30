import { test, expect } from '@playwright/test'

test('kanban board renders applications', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'KanbanCorp', role_title: 'Engineer', status: 'interested' },
  })
  await page.goto('/')
  await expect(page.getByText('KanbanCorp').first()).toBeVisible()
  await expect(page.getByText('Engineer').first()).toBeVisible()
})

test('timeline view renders after switching from kanban', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'TimelineCorp', role_title: 'Engineer', status: 'interested' },
  })
  await page.goto('/')
  await page.click('button:has-text("Timeline")')
  await page.waitForTimeout(400)
  await expect(page.getByText('TimelineCorp').first()).toBeVisible()
})

test('mobile viewport renders data', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'MobileCorp', role_title: 'Engineer', status: 'interested' },
  })
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /MobileCorp/ })).toBeVisible()
})

test('showClosed=false persists across view switches', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'PersistCorp', role_title: 'Engineer', status: 'rejected' },
  })

  await page.goto('/')

  // Hide closed column via global header toggle
  await page.getByRole('button', { name: 'Hide closed applications' }).click()
  await expect(page.getByText('PersistCorp').first()).not.toBeVisible()

  // Switch to Timeline view
  await page.click('button:has-text("Timeline")')
  await page.waitForTimeout(600)
  await expect(page.getByText('PersistCorp').first()).not.toBeVisible()

  // Switch back to Board
  await page.click('button:has-text("Board")')
  await page.waitForTimeout(600)
  await expect(page.getByText('PersistCorp').first()).not.toBeVisible()
})

test('timeline renders accepted bars in full colour and rejected bars muted', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'TimelineAccepted', role_title: 'Engineer', status: 'accepted' },
  })
  await request.post('/api/applications', {
    data: { company_name: 'TimelineRejected', role_title: 'Engineer', status: 'rejected' },
  })

  await page.goto('/')
  await page.click('button:has-text("Timeline")')
  await page.waitForTimeout(400)

  // Both apps should be visible (scoped to Timeline rows via role=button)
  await expect(page.getByRole('button', { name: 'TimelineAccepted — Engineer, currently accepted' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'TimelineRejected — Engineer, currently rejected' })).toBeVisible()

  // Rejected app label should be muted (text-ink-3)
  const rejectedRow = page.getByRole('button', { name: 'TimelineRejected — Engineer, currently rejected' })
  await expect(rejectedRow.locator('span').first()).toHaveClass(/text-ink-3/)

  // Accepted app label should be full weight (text-ink)
  const acceptedRow = page.getByRole('button', { name: 'TimelineAccepted — Engineer, currently accepted' })
  await expect(acceptedRow.locator('span').first()).toHaveClass(/text-ink/)
})
