import { test, expect } from '@playwright/test'
import { gotoPipeline, seedApp } from './helpers.js'

// Header search finds people and roles from any section and opens them over
// whatever is showing. Every spec seeds names no other spec uses and removes
// what it made, because the suite shares one in-memory database.

const searchBox = (page) => page.getByRole('combobox', { name: 'Search people and roles' })
const results = (page) => page.getByRole('listbox', { name: 'Search results' })
const contactDialog = (page, name) => page.getByRole('dialog', { name: `Contact: ${name}` })
const appDialog = (page, company) =>
  page.getByRole('dialog', { name: new RegExp(`Edit application .* ${company}$`) })

async function seedContact(request, data) {
  return (await request.post('/api/contacts', { data })).json()
}

async function cleanup(request, { apps = [], contacts = [] }) {
  for (const a of apps) await request.delete(`/api/applications/${a.id}`)
  for (const c of contacts) await request.delete(`/api/contacts/${c.id}`)
}

test('a person is found from Today before People has been visited', async ({ page, request }) => {
  const person = await seedContact(request, { name: 'Wenna Quorrin', employer: 'Halvex' })

  await page.goto('/')
  await searchBox(page).click()
  await searchBox(page).fill('quorr')
  await expect(results(page).getByRole('option', { name: /Wenna Quorrin/ })).toBeVisible()
  await page.keyboard.press('Enter')

  await expect(contactDialog(page, 'Wenna Quorrin')).toBeVisible()
  await expect(searchBox(page)).toHaveValue('')

  await cleanup(request, { contacts: [person] })
})

test('a phone number typed in national form finds the stored international number', async ({ page, request }) => {
  const person = await seedContact(request, { name: 'Ottilie Brasken', phone: '+61 498 765 432' })

  await page.goto('/')
  await searchBox(page).fill('0498 765')
  await expect(results(page).getByRole('option', { name: /Ottilie Brasken/ })).toBeVisible()

  await cleanup(request, { contacts: [person] })
})

test('Ctrl+K reaches the field on Pipeline and a role opens without leaving the section', async ({ page, request }) => {
  const app = await seedApp(request, { company_name: 'Zentravo', role_title: 'Platform Engineer', stage: 'applied' })

  await gotoPipeline(page)
  await page.keyboard.press('Control+k')
  await expect(searchBox(page)).toBeFocused()
  await page.keyboard.type('zentra')
  await page.keyboard.press('Enter')

  await expect(appDialog(page, 'Zentravo')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pipeline', exact: true })).toHaveAttribute('aria-current', /.+/)

  await cleanup(request, { apps: [app] })
})

test('with a role open, search floats above it and a person stacks over the role', async ({ page, request }) => {
  const app = await seedApp(request, { company_name: 'Morvane', role_title: 'Engineer', stage: 'applied' })
  const person = await seedContact(request, { name: 'Ilse Fendrick' })

  await page.goto('/')
  await searchBox(page).fill('morvane')
  await page.keyboard.press('Enter')
  await expect(appDialog(page, 'Morvane')).toBeVisible()

  await page.keyboard.press('Control+k')
  const floating = page.getByRole('dialog', { name: 'Search' })
  await expect(floating).toBeVisible()
  await expect(searchBox(page)).toBeFocused()
  await page.keyboard.type('fendrick')
  await page.keyboard.press('Enter')

  await expect(contactDialog(page, 'Ilse Fendrick')).toBeVisible()
  await expect(floating).toBeHidden()
  await page.getByRole('button', { name: 'Close contact' }).click()
  await expect(contactDialog(page, 'Ilse Fendrick')).toBeHidden()
  await expect(appDialog(page, 'Morvane')).toBeVisible()

  await cleanup(request, { apps: [app], contacts: [person] })
})

test('unsaved contact edits are kept when the user cancels the switch', async ({ page, request }) => {
  const app = await seedApp(request, { company_name: 'Quellbright', role_title: 'Engineer', stage: 'applied' })
  const person = await seedContact(request, { name: 'Bram Tollet' })

  await page.goto('/')
  await searchBox(page).fill('tollet')
  await page.keyboard.press('Enter')
  const drawer = contactDialog(page, 'Bram Tollet')
  await expect(drawer).toBeVisible()
  await drawer.getByLabel('Employer', { exact: true }).fill('Unsaved Employer')

  page.once('dialog', (d) => d.dismiss())
  await page.keyboard.press('Control+k')
  await page.keyboard.type('quellbright')
  await page.keyboard.press('Enter')

  await expect(drawer).toBeVisible()
  await expect(drawer.getByLabel('Employer', { exact: true })).toHaveValue('Unsaved Employer')
  await expect(appDialog(page, 'Quellbright')).toHaveCount(0)

  await cleanup(request, { apps: [app], contacts: [person] })
})

test('switching roles saves a typed note to the role it was written on', async ({ page, request }) => {
  const first = await seedApp(request, { company_name: 'Arnhollow', role_title: 'Engineer', stage: 'applied' })
  const second = await seedApp(request, { company_name: 'Brevitane', role_title: 'Engineer', stage: 'applied' })

  await page.goto('/')
  await searchBox(page).fill('arnhollow')
  await page.keyboard.press('Enter')
  const panel = appDialog(page, 'Arnhollow')
  await expect(panel).toBeVisible()
  await panel.getByPlaceholder(/Add a note/).fill('Spoke to the hiring manager')

  await page.keyboard.press('Control+k')
  await page.keyboard.type('brevitane')
  await page.keyboard.press('Enter')

  const next = appDialog(page, 'Brevitane')
  await expect(next).toBeVisible()
  await expect(next.getByPlaceholder(/Add a note/)).toHaveValue('')

  const saved = await (await request.get(`/api/applications/${first.id}`)).json()
  expect(JSON.stringify(saved)).toContain('Spoke to the hiring manager')
  const other = await (await request.get(`/api/applications/${second.id}`)).json()
  expect(JSON.stringify(other)).not.toContain('Spoke to the hiring manager')

  await cleanup(request, { apps: [first, second] })
})

test('switching roles with unsaved edits raises the prompt and stays put', async ({ page, request }) => {
  const first = await seedApp(request, { company_name: 'Corvantis', role_title: 'Engineer', stage: 'applied' })
  const second = await seedApp(request, { company_name: 'Delmorrow', role_title: 'Engineer', stage: 'applied' })

  await page.goto('/')
  await searchBox(page).fill('corvantis')
  await page.keyboard.press('Enter')
  const panel = appDialog(page, 'Corvantis')
  await expect(panel).toBeVisible()
  await panel.getByLabel('Role title').fill('Staff Engineer')

  await page.keyboard.press('Control+k')
  await page.keyboard.type('delmorrow')
  await page.keyboard.press('Enter')

  await expect(panel.getByText('Unsaved changes')).toBeVisible()
  await expect(panel.getByLabel('Role title')).toHaveValue('Staff Engineer')
  await expect(appDialog(page, 'Delmorrow')).toHaveCount(0)

  await cleanup(request, { apps: [first, second] })
})

test('arrow keys, no-match and Escape', async ({ page, request }) => {
  const a = await seedApp(request, { company_name: 'Fennimore One', role_title: 'Engineer', stage: 'applied' })
  const b = await seedApp(request, { company_name: 'Fennimore Two', role_title: 'Engineer', stage: 'applied' })

  await page.goto('/')
  await searchBox(page).fill('zzqx')
  await expect(results(page)).toContainText('No matches')
  await expect(results(page).getByRole('option')).toHaveCount(0)

  await searchBox(page).fill('fennimore')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(appDialog(page, 'Fennimore Two')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(appDialog(page, 'Fennimore Two')).toBeHidden()

  await searchBox(page).fill('fennimore')
  await expect(results(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(results(page)).toBeHidden()
  await expect(searchBox(page)).toHaveValue('')

  await cleanup(request, { apps: [a, b] })
})

test('a failed people load says so instead of reporting no matches', async ({ page }) => {
  await page.route(/\/api\/contacts(\?.*)?$/, (route) => route.abort())

  await page.goto('/')
  await searchBox(page).fill('nobody-here')
  await expect(results(page)).toContainText('Could not load people')
  await expect(results(page)).not.toContainText('No matches')
})

test('on a phone the Search button opens a full-width box that can be closed', async ({ page, request }) => {
  const person = await seedContact(request, { name: 'Pella Varnum' })
  await page.setViewportSize({ width: 390, height: 844 })

  await page.goto('/')
  await expect(searchBox(page)).toBeHidden()
  await page.getByRole('button', { name: 'Search people and roles' }).click()
  await expect(searchBox(page)).toBeFocused()

  await page.getByRole('button', { name: 'Close search' }).click()
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeHidden()

  await page.getByRole('button', { name: 'Search people and roles' }).click()
  await page.keyboard.type('varnum')
  await page.getByRole('option', { name: /Pella Varnum/ }).click()
  await expect(contactDialog(page, 'Pella Varnum')).toBeVisible()

  await cleanup(request, { contacts: [person] })
})

test('Ctrl+K does nothing while Settings is open', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open settings' }).click()
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Search' })).toHaveCount(0)
  await expect(searchBox(page)).not.toBeFocused()
})
