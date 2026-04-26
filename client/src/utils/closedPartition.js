const RECENT_CLOSED_DAYS = 14

export function partitionClosed(apps, now = Date.now()) {
  const recent = []
  const older = []
  for (const app of apps) {
    const dateStr = app.closed_at || app.updated_at
    const date = dateStr ? new Date(dateStr).getTime() : 0
    const days = (now - date) / 86_400_000
    if (days < RECENT_CLOSED_DAYS) {
      recent.push(app)
    } else {
      older.push(app)
    }
  }
  return { recent, older }
}
