import { test, expect } from '@playwright/test'

test('kanban board renders applications', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'KanbanCorp', role_title: 'Engineer', status: 'interested' },
  })
  await page.goto('/')
  await expect(page.getByText('KanbanCorp').first()).toBeVisible()
  await expect(page.getByText('Engineer').first()).toBeVisible()
})

test('table view renders after switching from kanban', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'TableCorp', role_title: 'Engineer', status: 'interested' },
  })
  await page.goto('/')
  await page.click('button:has-text("Table")')
  await expect(page.getByText('TableCorp').first()).toBeVisible()
  await expect(page.getByText('Engineer').first()).toBeVisible()
})

test('timeline view renders after switching from kanban', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'TimelineCorp', role_title: 'Engineer', status: 'interested' },
  })
  await page.goto('/')
  await page.click('button:has-text("Timeline")')
  await expect(page.getByText('TimelineCorp').first()).toBeVisible()
})

test('mobile viewport renders data', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'MobileCorp', role_title: 'Engineer', status: 'interested' },
  })
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')
  await expect(page.getByText('MobileCorp').first()).toBeVisible()
  await expect(page.getByText('Engineer').first()).toBeVisible()
})

test('showClosed=false persists across view switches', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'PersistCorp', role_title: 'Engineer', status: 'rejected' },
  })

  await page.goto('/')

  // Hide closed column in Kanban
  await page.getByRole('button', { name: 'Hide closed applications' }).first().click()
  await expect(page.getByText('PersistCorp').first()).not.toBeVisible()

  // Switch to Table view (wait for transition)
  await page.click('button:has-text("Table")')
  await page.waitForTimeout(600)
  await expect(page.getByText('PersistCorp').first()).not.toBeVisible()

  // Switch to Timeline view (wait for transition)
  await page.click('button:has-text("Timeline")')
  await page.waitForTimeout(600)
  await expect(page.getByText('PersistCorp').first()).not.toBeVisible()

  // Switch back to Kanban (wait for transition)
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
  await expect(page.getByRole('button', { name: 'TimelineAccepted Engineer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'TimelineRejected Engineer' })).toBeVisible()

  // Rejected app label should be muted (text-ink-3)
  const rejectedRow = page.getByRole('button', { name: 'TimelineRejected Engineer' })
  await expect(rejectedRow.locator('span').first()).toHaveClass(/text-ink-3/)

  // Accepted app label should be full weight (text-ink-2)
  const acceptedRow = page.getByRole('button', { name: 'TimelineAccepted Engineer' })
  await expect(acceptedRow.locator('span').first()).toHaveClass(/text-ink-2/)
})
