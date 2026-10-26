// Today is home, so a spec that exercises the board opens the Pipeline first.
export async function gotoPipeline(page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Pipeline', exact: true }).click()
  // The section crossfades in; the same short settle the view specs use.
  await page.waitForTimeout(400)
}

// Creates a record through the API at a starting stage, and closes it with the
// given reason when one is passed (a record is always created open).
export async function seedApp(request, data, closeReason) {
  const created = await request.post('/api/applications', { data })
  const app = await created.json()
  if (closeReason) {
    await request.put(`/api/applications/${app.id}`, {
      data: { state: 'closed', close_reason: closeReason },
    })
  }
  return app
}
