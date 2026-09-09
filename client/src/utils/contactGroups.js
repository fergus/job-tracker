/**
 * The People section's four groups.
 *
 * Pure module. The server owns classification and order (KTD1): it returns
 * `overdue`, `due`, `upcoming` or null, already sorted owed-first and then
 * longest-quiet, with the never-contacted last. This maps those states onto
 * the labels the section shows and preserves the order it was handed. It never
 * reclassifies a date or re-sorts a list -- doing either would put the browser
 * and the API on different answers across a day boundary.
 */

import { MS_PER_DAY } from './date.js'

/** Group keys in render order: what is owed, then everyone else. */
export const GROUP_ORDER = ['overdue', 'due', 'upcoming', 'none']

// KTD2: three server states, four client labels. `due` reads as Today because
// "due" is the API's word for it, not the user's. Headings carry no counts.
const GROUP_LABELS = {
  overdue: 'Overdue',
  due: 'Today',
  upcoming: 'Upcoming',
  none: 'No commitment',
}

/**
 * Bucket contacts into the four groups in a single pass.
 *
 * A dated group with nobody in it is omitted (R25) -- an empty Overdue heading
 * is a flag, and this view does not flag. The no-commitment group always
 * renders: it is the working list, not the leftovers.
 *
 * @param {Array} contacts server-ordered contact list
 * @returns {Array<{key: string, label: string, contacts: Array}>}
 */
export function groupContacts(contacts) {
  const buckets = { overdue: [], due: [], upcoming: [], none: [] }

  for (const contact of contacts ?? []) {
    const bucket = buckets[contact.follow_up_state] ?? buckets.none
    bucket.push(contact)
  }

  return GROUP_ORDER.filter(
    (key) => key === 'none' || buckets[key].length > 0,
  ).map((key) => ({ key, label: GROUP_LABELS[key], contacts: buckets[key] }))
}

/**
 * How long since this person was last contacted, in prose.
 *
 * `today` is passed in rather than read from the clock so the caller can drive
 * it from a reactive date and a session left open overnight does not keep
 * showing yesterday's wording (KTD7).
 *
 * @param {string|null} lastContactedAt calendar date, or null if never
 * @param {string} today calendar date to measure against
 */
export function contactedProse(lastContactedAt, today) {
  if (!lastContactedAt) return 'Never contacted'

  const elapsed = Math.max(
    0,
    Math.round(
      (Date.parse(`${today}T00:00:00Z`) -
        Date.parse(`${lastContactedAt.slice(0, 10)}T00:00:00Z`)) /
        MS_PER_DAY,
    ),
  )

  if (elapsed === 0) return 'Last contacted today'
  if (elapsed < 7) return `Last contacted ${plural(elapsed, 'day')} ago`
  if (elapsed < 30) return `Last contacted ${plural(Math.floor(elapsed / 7), 'week')} ago`
  return `Last contacted ${plural(Math.floor(elapsed / 30), 'month')} ago`
}

function plural(count, noun) {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}
