import { test, expect } from '@playwright/test'

// Sortable decides where a card lands from the dragover events it sees along
// the way, so the pointer is walked to the target in steps. A single jump only
// registers when the target column is nearly empty, which made these specs pass
// or fail on how many records earlier specs happened to leave behind.
async function dragWithDelay(page, sourceLocator, targetLocator, delay = 150) {
  const sourceBox = await sourceLocator.boundingBox()
  const targetBox = await targetLocator.boundingBox()

  const fromX = sourceBox.x + sourceBox.width / 2
  const fromY = sourceBox.y + sourceBox.height / 2
  const toX = targetBox.x + targetBox.width / 2
  const toY = targetBox.y + targetBox.height / 2

  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  await page.waitForTimeout(delay)

  const STEPS = 10
  for (let step = 1; step <= STEPS; step++) {
    await page.mouse.move(
      fromX + ((toX - fromX) * step) / STEPS,
      fromY + ((toY - fromY) * step) / STEPS,
    )
    await page.waitForTimeout(20)
  }
  await page.mouse.up()
}

test('dragging offer card to closed column closes it without claiming a rejection', async ({ page, request }) => {
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

  // Wait for the close API call to complete
  await page.waitForTimeout(500)

  // The drag says "this is over", not "they turned me down". The record closes
  // with no reason claimed, and its stage is left where it actually got to.
  const response = await request.get('/api/applications')
  const apps = await response.json()
  const offerApp = apps.find(a => a.company_name === 'OfferCorp')
  expect(offerApp).toBeDefined()
  expect(offerApp.state).toBe('closed')
  expect(offerApp.close_reason).toBe('unresolved')
  expect(offerApp.stage).toBe('offer')
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

test('dragging an accepted card into Rejected records a rejection, not a no-op', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'AcceptedCorp', role_title: 'Engineer', status: 'accepted' },
  })

  await page.goto('/')
  await expect(page.getByText('AcceptedCorp').first()).toBeVisible()

  const acceptedCard = page.getByText('AcceptedCorp').first()
  // closed-drop-zone is the Rejected sub-list inside the Closed column.
  const rejectedDropZone = page.getByTestId('closed-drop-zone')
  await dragWithDelay(page, acceptedCard, rejectedDropZone)

  await page.waitForTimeout(500)

  // Correcting an acceptance to a rejection is an explicit judgement, so this
  // is the one drag allowed to name a rejection. It must not silently do nothing.
  const response = await request.get('/api/applications')
  const apps = await response.json()
  const app = apps.find(a => a.company_name === 'AcceptedCorp')
  expect(app).toBeDefined()
  expect(app.state).toBe('closed')
  expect(app.close_reason).toBe('rejected')
})

test('dragging an open card into Accepted records an acceptance, not a rejection', async ({ page, request }) => {
  await request.post('/api/applications', {
    data: { company_name: 'AcceptMeCorp', role_title: 'Engineer', status: 'offer' },
  })

  await page.goto('/')
  await expect(page.getByText('AcceptMeCorp').first()).toBeVisible()

  const openCard = page.getByText('AcceptMeCorp').first()
  const acceptedDropZone = page.getByTestId('accepted-drop-zone')
  await dragWithDelay(page, openCard, acceptedDropZone)

  await page.waitForTimeout(500)

  // The drop target names the outcome. Closing as 'unresolved' re-derived
  // status='rejected', so the card reappeared under Rejected and acceptance
  // was unrepresentable from the board.
  const response = await request.get('/api/applications')
  const apps = await response.json()
  const app = apps.find(a => a.company_name === 'AcceptMeCorp')
  expect(app).toBeDefined()
  expect(app.state).toBe('closed')
  expect(app.close_reason).toBe('accepted')
  expect(app.status).toBe('accepted')
  expect(app.stage).toBe('offer')

  // The suite shares one in-memory DB with no per-test reset, so leave the
  // Closed column as we found it -- an extra closed card shifts the layout
  // that the show-older toggle test depends on.
  await request.delete(`/api/applications/${app.id}`)
})
