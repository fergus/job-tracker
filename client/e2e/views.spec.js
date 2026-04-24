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
