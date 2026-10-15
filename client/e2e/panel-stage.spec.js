import { test, expect } from '@playwright/test'
import { gotoPipeline, seedApp } from './helpers.js'

// The suite shares one in-memory DB, so each spec uses its own company names
// and removes the records it closed.
async function findApp(request, company) {
  const apps = await (await request.get('/api/applications')).json()
  return apps.find(a => a.company_name === company)
}

async function openPanel(page, company) {
  await gotoPipeline(page)
  await page.getByRole('button', { name: `${company} Engineer` }).click()
  const dialog = page.getByRole('dialog', { name: new RegExp(company) })
  await expect(dialog).toBeVisible()
  return dialog
}

test('a stage pill moves the record and Undo restores the previous stage', async ({ page, request }) => {
  await seedApp(request, { company_name: 'PanelStageCo', role_title: 'Engineer', stage: 'applied' })

  const dialog = await openPanel(page, 'PanelStageCo')
  await dialog.getByRole('button', { name: 'interview', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'interview', exact: true })).toHaveAttribute('aria-pressed', 'true')

  const moved = await findApp(request, 'PanelStageCo')
  expect(moved.stage).toBe('interview')
  expect(moved.interview_at).toBeTruthy()
  expect('status' in moved).toBe(false)

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'applied', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect((await findApp(request, 'PanelStageCo')).stage).toBe('applied')

  await request.delete(`/api/applications/${moved.id}`)
})

test('Close opens the picker; Accepted is reachable and Undo reopens', async ({ page, request }) => {
  await seedApp(request, { company_name: 'PanelAcceptCo', role_title: 'Engineer', stage: 'offer' })

  const dialog = await openPanel(page, 'PanelAcceptCo')
  await dialog.getByTestId('panel-close-action').click()
  const picker = page.getByTestId('close-reason-picker')
  await expect(picker).toBeVisible()
  await picker.getByTestId('close-reason-accepted').click()

  await expect(dialog.getByTestId('panel-close-action')).toContainText('Closed')
  const closed = await findApp(request, 'PanelAcceptCo')
  expect(closed.state).toBe('closed')
  expect(closed.close_reason).toBe('accepted')
  expect(closed.stage).toBe('offer')
  await expect(dialog.getByTestId('panel-close-reason')).toHaveText('Offer accepted')

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(dialog.getByTestId('panel-close-action')).toHaveText('Close')
  const reopened = await findApp(request, 'PanelAcceptCo')
  expect(reopened.state).toBe('open')
  expect(reopened.close_reason).toBeNull()

  await request.delete(`/api/applications/${reopened.id}`)
})

test('Escape on the picker cancels it and leaves the panel open', async ({ page, request }) => {
  await seedApp(request, { company_name: 'PanelEscapeCo', role_title: 'Engineer', stage: 'applied' })

  const dialog = await openPanel(page, 'PanelEscapeCo')
  await dialog.getByTestId('panel-close-action').click()
  await expect(page.getByTestId('close-reason-picker')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('close-reason-picker')).toHaveCount(0)
  await expect(dialog).toBeVisible()
  expect((await findApp(request, 'PanelEscapeCo')).state).toBe('open')

  await request.delete(`/api/applications/${(await findApp(request, 'PanelEscapeCo')).id}`)
})

test('a closed record shows its reason, reopens from a stage pill and can be re-reasoned', async ({ page, request }) => {
  await seedApp(request, { company_name: 'PanelReopenCo', role_title: 'Engineer', stage: 'applied' }, 'lapsed')

  await gotoPipeline(page)
  await page.getByRole('button', { name: 'PanelReopenCo Engineer' }).click()
  const dialog = page.getByRole('dialog', { name: /PanelReopenCo/ })
  await expect(dialog.getByTestId('panel-close-reason')).toHaveText('No response')
  for (const stage of ['interested', 'applied', 'responded', 'interview', 'offer']) {
    await expect(dialog.getByRole('button', { name: stage, exact: true })).toHaveAttribute('aria-pressed', 'false')
  }

  // Change the reason through the picker, preselected on the current one.
  await dialog.getByRole('button', { name: 'Change', exact: true }).click()
  const picker = page.getByTestId('close-reason-picker')
  await expect(picker.getByTestId('close-reason-lapsed')).toHaveAttribute('aria-pressed', 'true')
  await picker.getByTestId('close-reason-withdrawn').click()
  await expect(dialog.getByTestId('panel-close-reason')).toHaveText('I withdrew')
  expect((await findApp(request, 'PanelReopenCo')).close_reason).toBe('withdrawn')

  // A stage pill reopens it at that stage.
  await dialog.getByRole('button', { name: 'responded', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'responded', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const reopened = await findApp(request, 'PanelReopenCo')
  expect(reopened.state).toBe('open')
  expect(reopened.stage).toBe('responded')
  expect(reopened.close_reason).toBeNull()

  await request.delete(`/api/applications/${reopened.id}`)
})

test('creating from the panel sends stage and record type and no status', async ({ page, request }) => {
  await gotoPipeline(page)
  const bodies = []
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/api/applications')) {
      bodies.push(req.postData() || '')
    }
  })

  // A lead at the default stage.
  await page.getByRole('button', { name: '+ Add Application' }).click()
  let dialog = page.getByRole('dialog', { name: 'Add application' })
  await dialog.getByLabel('Company name').fill('PanelLeadCo')
  await dialog.getByLabel('Role title').fill('Engineer')
  await dialog.getByRole('button', { name: 'Create Application' }).click()
  await expect.poll(async () => (await findApp(request, 'PanelLeadCo'))?.record_type).toBe('lead')
  // Creating leaves the new record open in the panel; close it before adding another.
  await page.getByRole('button', { name: 'Close panel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // A stage of applied or beyond forces application, whatever the toggle says.
  await page.getByRole('button', { name: '+ Add Application' }).click()
  dialog = page.getByRole('dialog', { name: 'Add application' })
  await dialog.getByLabel('Company name').fill('PanelAppliedCo')
  await dialog.getByLabel('Role title').fill('Engineer')
  await dialog.getByRole('button', { name: 'interview', exact: true }).click()
  await expect(dialog.getByTestId('create-record-type-lead')).toBeDisabled()
  await dialog.getByRole('button', { name: 'Create Application' }).click()
  await expect.poll(async () => (await findApp(request, 'PanelAppliedCo'))?.record_type).toBe('application')

  const applied = await findApp(request, 'PanelAppliedCo')
  expect(applied.stage).toBe('interview')
  expect(bodies.length).toBe(2)
  expect(bodies.every(b => !b.includes('name="status"'))).toBe(true)
  expect(bodies.every(b => b.includes('name="stage"') && b.includes('name="record_type"'))).toBe(true)

  await request.delete(`/api/applications/${applied.id}`)
  await request.delete(`/api/applications/${(await findApp(request, 'PanelLeadCo')).id}`)
})

test('the note stage list still offers accepted and rejected', async ({ page, request }) => {
  const app = await seedApp(request, { company_name: 'PanelNoteCo', role_title: 'Engineer', stage: 'applied' })

  const dialog = await openPanel(page, 'PanelNoteCo')
  const options = await dialog.getByLabel('Note stage').locator('option').allTextContents()
  expect(options).toEqual(['interested', 'applied', 'responded', 'interview', 'offer', 'accepted', 'rejected'])

  await request.delete(`/api/applications/${app.id}`)
})
