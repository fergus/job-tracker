import { test, expect } from '@playwright/test'

async function dragWithDelay(page, sourceLocator, targetLocator, delay = 150) {
  const sourceBox = await sourceLocator.boundingBox()
  const targetBox = await targetLocator.boundingBox()

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(delay)
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2)
  await page.mouse.up()
}

test('dragging offer card to closed column changes status to rejected on desktop', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'OfferCorp', role_title: 'Engineer', status: 'offer' },
  })

  await page.goto('/')

  // Verify the card starts in the Offer column
  await expect(page.getByText('OfferCorp').first()).toBeVisible()

  // Drag the offer card to the Closed column drop zone
  const offerCard = page.getByText('OfferCorp').first()
  const closedDropZone = page.getByTestId('closed-drop-zone')
  await dragWithDelay(page, offerCard, closedDropZone)

  // Wait for the status-change API call to complete
  await page.waitForTimeout(500)

  // Verify via API that the status was changed to rejected
  const response = await request.get('/api/applications')
  const apps = await response.json()
  const offerApp = apps.find(a => a.company_name === 'OfferCorp')
  expect(offerApp).toBeDefined()
  expect(offerApp.status).toBe('rejected')
})

test('dragging rejected card from closed to active column changes status', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'DragOutCorp', role_title: 'Engineer', status: 'rejected' },
  })

  await page.goto('/')

  // Verify the card starts in the Closed column
  await expect(page.getByText('DragOutCorp').first()).toBeVisible()

  // Drag the rejected card to the Interested column
  const rejectedCard = page.getByText('DragOutCorp').first()
  const interestedColumn = page.locator('h3:has-text("Interested")').locator('..').locator('..').locator('.bg-sunken').first()
  await dragWithDelay(page, rejectedCard, interestedColumn)

  // Wait for the status-change API call to complete
  await page.waitForTimeout(500)

  // Verify via API that the status was changed to interested
  const response = await request.get('/api/applications')
  const apps = await response.json()
  const app = apps.find(a => a.company_name === 'DragOutCorp')
  expect(app).toBeDefined()
  expect(app.status).toBe('interested')
})
