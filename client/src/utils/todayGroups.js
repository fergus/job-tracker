/**
 * The Today section's three groups.
 *
 * Pure module. The server owns membership, classification and order: it
 * returns items already sorted, each carrying `overdue`, `due` or `upcoming`.
 * This maps those states onto the labels Today shows and keeps the order it
 * was handed. It never reclassifies a date or re-sorts -- doing either would
 * put the browser and the API on different answers across a day boundary.
 */

/** Group keys in render order. */
export const TODAY_GROUP_ORDER = ['overdue', 'due', 'upcoming']

// `due` reads as Today and `upcoming` as This week: the server only returns
// the next seven days, so every upcoming item is this week's. No counts in the
// headings -- urgency reads as prose and order, not as a tally.
const LABELS = {
  overdue: 'Overdue',
  due: 'Today',
  upcoming: 'This week',
}

/**
 * Bucket items into the three groups in a single pass, omitting empty ones.
 * An item with no known state is dropped; the server never sends one.
 *
 * @param {Array} items server-ordered Today items
 * @returns {Array<{key: string, label: string, items: Array}>}
 */
export function groupToday(items) {
  const buckets = { overdue: [], due: [], upcoming: [] }
  for (const item of items ?? []) {
    buckets[item.follow_up_state]?.push(item)
  }
  return TODAY_GROUP_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    label: LABELS[key],
    items: buckets[key],
  }))
}

/** A row's kind in words, so the distinction never rests on colour alone. */
export function kindLabel(item) {
  if (item.kind === 'contact') return 'Person'
  return item.record_type === 'lead' ? 'Lead' : 'Role'
}
