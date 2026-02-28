const STAGE_ORDER = ['interested', 'applied', 'screening', 'interview', 'offer']
const TERMINAL_STAGES = ['accepted', 'rejected']

const STAGE_DATE_MAP = {
  applied: 'applied_at',
  screening: 'screening_at',
  interview: 'interview_at',
  offer: 'offer_at',
}

const STAGE_COLORS = {
  interested: '#9ca3af',
  applied: '#3b82f6',
  screening: '#f59e0b',
  interview: '#a855f7',
  offer: '#22c55e',
  accepted: '#10b981',
  rejected: '#ef4444',
}

export function stageColor(stage) {
  return STAGE_COLORS[stage] || '#9ca3af'
}

export function computeSegments(application, globalEnd) {
  const today = globalEnd || new Date().toISOString()
  const isTerminal = TERMINAL_STAGES.includes(application.status)

  // Build ordered list of { stage, date } transition points
  const points = [{ stage: 'interested', date: application.created_at }]

  for (const stage of STAGE_ORDER.slice(1)) {
    const dateKey = STAGE_DATE_MAP[stage]
    if (application[dateKey]) {
      points.push({ stage, date: application[dateKey] })
    }
  }

  const terminalDate = application.closed_at
  const trailingEnd = isTerminal && terminalDate ? terminalDate : today

  const segments = []

  for (let i = 0; i < points.length; i++) {
    const start = points[i].date
    const end = i + 1 < points.length ? points[i + 1].date : trailingEnd
    const isTrailing = i === points.length - 1 && !isTerminal

    if (!start) continue

    segments.push({
      stage: points[i].stage,
      start,
      end,
      isTrailing,
    })
  }

  // Add terminal stage segment if application is closed
  if (isTerminal && terminalDate) {
    segments.push({
      stage: application.status,
      start: terminalDate,
      end: terminalDate,
      isTrailing: false,
    })
  }

  return segments
}

export function durationDays(start, end) {
  const ms = new Date(end) - new Date(start)
  return Math.max(0, Math.round(ms / 86400000))
}
