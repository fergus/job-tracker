/**
 * What a board card shows in its single status slot.
 *
 * Pure module so the slot rule is testable without mounting the card, and so
 * the staleness examples can be proven here: the e2e server cannot seed an old
 * updated_at.
 *
 * One slot, one signal (KD8): an explicit follow-up date supersedes the
 * derived staleness indicator. The follow-up side only renders the server's
 * classification (`follow_up_state`, `follow_up_days`) through the shared
 * wording helpers, so the card never computes a date and cannot disagree with
 * the API, MCP, or the People view (R5).
 */
import { followUpBrief, followUpProse, followUpTone } from './followUp.js'
import { formatRelativeDate, MS_PER_DAY } from './date.js'

const STALE_STAGES = new Set(['applied', 'responded', 'interview', 'offer'])

// Dots mark what is owed; an upcoming date is information, not a nudge.
const FOLLOW_UP_DOTS = { overdue: 'bg-danger', due: 'bg-accent' }

function formatStaleDuration(days) {
  if (days >= 60) return `${Math.round(days / 30)} months`
  if (days >= 30) return '1 month'
  return `${Math.round(days)} days`
}

function stalenessSignal(application, now) {
  const staleDays = STALE_STAGES.has(application.status)
    ? (now - new Date(application.updated_at)) / MS_PER_DAY
    : 0
  const level = staleDays >= 30 ? 2 : staleDays >= 14 ? 1 : 0

  let title = ''
  if (level > 0) {
    const duration = formatStaleDuration(staleDays)
    title = level === 2
      ? `No movement in ${duration} — worth following up`
      : `No movement in ${duration}`
  }

  return {
    kind: 'staleness',
    text: formatRelativeDate(application.updated_at),
    title,
    tone: level === 2 ? 'text-danger' : level === 1 ? 'text-accent' : 'text-ink-3',
    dot: level === 2 ? 'bg-danger' : level === 1 ? 'bg-accent' : null,
  }
}

/**
 * @param {object} application an application as the API returns it
 * @param {number} now epoch ms, the clock the staleness age is measured from
 * @returns {{ kind: 'follow-up'|'staleness', text: string, title: string,
 *   tone: string, dot: string|null }} `text` is the slot's visible wording,
 *   `title` its hover text, `tone` the ink class, `dot` the dot's background
 *   class or null for no dot
 */
export function cardSignal(application, now = Date.now()) {
  const { follow_up_state: state, follow_up_days: days } = application
  if (!state) return stalenessSignal(application, now)

  return {
    kind: 'follow-up',
    text: followUpBrief(state, days),
    // Full prose on hover so an overdue card states exactly how late it is.
    title: followUpProse(state, days, null),
    tone: followUpTone(state),
    dot: FOLLOW_UP_DOTS[state] || null,
  }
}
