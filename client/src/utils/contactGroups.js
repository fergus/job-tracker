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
 * Takes the server's own `days_since_contact` rather than recomputing it. The
 * server derives it against the instance timezone (KTD1); redoing the same
 * arithmetic here against the browser's calendar date put the two on different
 * answers for anyone whose browser zone differs from the instance zone, and
 * left the field the API ships unread.
 *
 * @param {number|null} daysSinceContact whole days, or null if never contacted
 */
export function contactedProse(daysSinceContact) {
  if (daysSinceContact === null || daysSinceContact === undefined) {
    return 'Never contacted'
  }
  if (daysSinceContact === 0) return 'Last contacted today'
  if (daysSinceContact < 7) return `Last contacted ${plural(daysSinceContact, 'day')} ago`
  if (daysSinceContact < 30) {
    return `Last contacted ${plural(Math.floor(daysSinceContact / 7), 'week')} ago`
  }
  return `Last contacted ${plural(Math.floor(daysSinceContact / 30), 'month')} ago`
}

function plural(count, noun) {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}
