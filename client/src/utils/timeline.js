export const STAGE_ORDER = ['interested', 'applied', 'screening', 'interview', 'offer']
export const TERMINAL_STAGES = ['accepted', 'rejected']

export function isTerminal(status) {
  return TERMINAL_STAGES.includes(status)
}

export function isQuieted(status) {
  return status === 'rejected'
}

const STAGE_DATE_MAP = {
  interested: 'interested_at',
  applied: 'applied_at',
  screening: 'screening_at',
  interview: 'interview_at',
  offer: 'offer_at',
}

export function stageColor(stage) {
  return `var(--stage-${stage}, oklch(57% 0.04 240))`
}

export function computeSegments(application, globalEnd) {
  const today = globalEnd || new Date().toISOString()
  const isTerminal = TERMINAL_STAGES.includes(application.status)

  // Build ordered list of { stage, date } transition points
  const points = []

  for (const stage of STAGE_ORDER) {
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
