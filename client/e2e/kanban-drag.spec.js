import { test, expect } from '@playwright/test'
import { gotoPipeline, seedApp } from './helpers.js'

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

// Everything a spec closes stays in the shared in-memory DB, and an extra closed
// card shifts the layout the show-older toggle test depends on, so each spec
// removes the records it made.
async function findApp(request, company) {
  const apps = await (await request.get('/api/applications')).json()
  return apps.find(a => a.company_name === company)
}

async function cleanup(request, ...companies) {
  for (const company of companies) {
    const app = await findApp(request, company)
    if (app) await request.delete(`/api/applications/${app.id}`)
  }
}

function column(page, label) {
  return page.locator(`h3:has-text("${label}")`).locator('..').locator('..').locator('[data-testid^="well-"]').first()
}

// The board card, not the offer rail chip that repeats an offer's company name.
function card(page, company) {
  return page.locator('[role="button"]').filter({ hasText: company }).first()
}

test('dropping an open card on Closed asks for a reason and closes with the one picked', async ({ page, request }) => {
  await seedApp(request, { company_name: 'OfferCorp', role_title: 'Engineer', stage: 'offer' })

  await gotoPipeline(page)
  await expect(card(page, 'OfferCorp')).toBeVisible()

  await dragWithDelay(page, card(page, 'OfferCorp'), page.getByTestId('closed-drop-zone'))

  // Nothing is saved until a reason is chosen.
  const picker = page.getByTestId('close-reason-picker')
  await expect(picker).toBeVisible()
  expect((await findApp(request, 'OfferCorp')).state).toBe('open')

  await picker.getByTestId('close-reason-role_closed').click()
  await page.waitForTimeout(500)

  const app = await findApp(request, 'OfferCorp')
  expect(app.state).toBe('closed')
  expect(app.close_reason).toBe('role_closed')
  expect(app.stage).toBe('offer')
  expect('status' in app).toBe(false)

  // The card shows the real reason, not a rejection.
  await expect(page.getByTestId('close-reason-badge').filter({ hasText: 'Role closed' }).first()).toBeVisible()
  await cleanup(request, 'OfferCorp')
})

test('the picker offers all seven reasons, including Accepted', async ({ page, request }) => {
  await seedApp(request, { company_name: 'AcceptMeCorp', role_title: 'Engineer', stage: 'offer' })

  await gotoPipeline(page)
  await dragWithDelay(page, card(page, 'AcceptMeCorp'), page.getByTestId('closed-drop-zone'))

  const picker = page.getByTestId('close-reason-picker')
  await expect(picker).toBeVisible()
  for (const reason of ['accepted', 'rejected', 'withdrawn', 'role_closed', 'lapsed', 'not_pursued', 'unresolved']) {
    await expect(picker.getByTestId(`close-reason-${reason}`)).toBeVisible()
  }

  await picker.getByTestId('close-reason-accepted').click()
  await page.waitForTimeout(500)

  const app = await findApp(request, 'AcceptMeCorp')
  expect(app.state).toBe('closed')
  expect(app.close_reason).toBe('accepted')
  expect(app.stage).toBe('offer')
  await cleanup(request, 'AcceptMeCorp')
})

test('Escape on the picker saves nothing and the card returns to its column', async ({ page, request }) => {
  await seedApp(request, { company_name: 'EscapeCorp', role_title: 'Engineer', stage: 'applied' })

  await gotoPipeline(page)
  const appliedColumn = column(page, 'Applied')
  await expect(appliedColumn.getByText('EscapeCorp')).toBeVisible()

  await dragWithDelay(page, page.getByText('EscapeCorp').first(), page.getByTestId('closed-drop-zone'))
  await expect(page.getByTestId('close-reason-picker')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('close-reason-picker')).toHaveCount(0)

  await expect(appliedColumn.getByText('EscapeCorp')).toBeVisible()
  const app = await findApp(request, 'EscapeCorp')
  expect(app.state).toBe('open')
  expect(app.close_reason).toBeNull()
  await cleanup(request, 'EscapeCorp')
})

test('dragging a closed card to an open column reopens it at that stage', async ({ page, request }) => {
  await seedApp(request, { company_name: 'DragOutCorp', role_title: 'Engineer', stage: 'applied' }, 'rejected')

  await gotoPipeline(page)
  await expect(page.getByText('DragOutCorp').first()).toBeVisible()

  await dragWithDelay(page, page.getByText('DragOutCorp').first(), column(page, 'Responded'))
  await page.waitForTimeout(500)

  const app = await findApp(request, 'DragOutCorp')
  expect(app.state).toBe('open')
  expect(app.stage).toBe('responded')
  expect(app.close_reason).toBeNull()
  expect(app.closed_at).toBeNull()
  expect(app.responded_at).toBeTruthy()
  await cleanup(request, 'DragOutCorp')
})

test('reopening into the Interview column keeps an offer at offer', async ({ page, request }) => {
  await seedApp(request, { company_name: 'OfferKeepCorp', role_title: 'Engineer', stage: 'offer' }, 'withdrawn')

  await gotoPipeline(page)
  await dragWithDelay(page, card(page, 'OfferKeepCorp'), column(page, 'Interview'))
  await page.waitForTimeout(500)

  const app = await findApp(request, 'OfferKeepCorp')
  expect(app.state).toBe('open')
  expect(app.stage).toBe('offer')
  await cleanup(request, 'OfferKeepCorp')
})

test('moving a card between open stages stamps the stage date, and Undo puts it back', async ({ page, request }) => {
  await seedApp(request, { company_name: 'StampCorp', role_title: 'Engineer', stage: 'interested' })

  await gotoPipeline(page)
  await dragWithDelay(page, page.getByText('StampCorp').first(), column(page, 'Applied'))
  await page.waitForTimeout(500)

  const moved = await findApp(request, 'StampCorp')
  expect(moved.stage).toBe('applied')
  expect(moved.applied_at).toBeTruthy()

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForTimeout(500)

  const restored = await findApp(request, 'StampCorp')
  expect(restored.stage).toBe('interested')
  expect(restored.state).toBe('open')
  await cleanup(request, 'StampCorp')
})

test('Undo of a close restores the stage date and the follow-up the close cleared', async ({ page, request }) => {
  const seeded = await seedApp(request, {
    company_name: 'UndoCloseCorp',
    role_title: 'Engineer',
    stage: 'applied',
    next_action_at: '2099-01-01',
    next_action: 'Send references',
  })
  const before = await findApp(request, 'UndoCloseCorp')
  expect(before.applied_at).toBeTruthy()

  await gotoPipeline(page)
  await dragWithDelay(page, page.getByText('UndoCloseCorp').first(), page.getByTestId('closed-drop-zone'))
  await page.getByTestId('close-reason-picker').getByTestId('close-reason-lapsed').click()
  await page.waitForTimeout(500)

  const closed = await findApp(request, 'UndoCloseCorp')
  expect(closed.state).toBe('closed')
  expect(closed.next_action).toBeNull()

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForTimeout(500)

  const restored = await findApp(request, 'UndoCloseCorp')
  expect(restored.state).toBe('open')
  expect(restored.stage).toBe('applied')
  expect(restored.applied_at).toBe(before.applied_at)
  expect(restored.next_action).toBe('Send references')
  expect(restored.next_action_at).toBe('2099-01-01')
  await request.delete(`/api/applications/${seeded.id}`)
})

test('on a phone-width screen the Closed group lists closed cards with their reason', async ({ page, request }) => {
  // A drag across the sideways-scrolling strip cannot be driven reliably, so the
  // mobile drop target is covered by what it renders. It shares onClosedAdded
  // with the desktop column, whose drop is exercised above.
  await page.setViewportSize({ width: 390, height: 844 })
  await seedApp(request, { company_name: 'MobileSeedClosed', role_title: 'Engineer', stage: 'applied' }, 'lapsed')

  await gotoPipeline(page)
  const zone = page.getByTestId('closed-drop-zone-mobile')
  await expect(zone.getByText('MobileSeedClosed')).toHaveCount(1)
  await expect(zone.getByTestId('close-reason-badge')).toContainText('No response')
  await cleanup(request, 'MobileSeedClosed')
})
