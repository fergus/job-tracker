// Today is home, so a spec that exercises the board opens the Pipeline first.
export async function gotoPipeline(page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Pipeline', exact: true }).click()
  // The section crossfades in; the same short settle the view specs use.
  await page.waitForTimeout(400)
}
