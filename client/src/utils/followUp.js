/**
 * Follow-up wording.
 *
 * Pure module: the server owns the classification (`follow_up_state`) and the
 * day count (`follow_up_days`); this only turns them into prose. Two panels
 * carried near-identical copies of these strings, and a third would have made
 * the wording impossible to change in one place -- an end-to-end test asserts
 * the exact sentence a contact reads.
 */

/**
 * The commitment as a sentence: how late or how soon, and what was committed.
 * Returns an empty string when there is no commitment to state.
 *
 * @param {string|null} state `overdue` | `due` | `upcoming`, or null
 * @param {number|null} days whole days until the date; negative when overdue
 * @param {string|null} action the commitment's own wording, if any
 */
export function followUpProse(state, days, action) {
  if (!state) return ''
  const what = action ? `: ${action}` : ''
  if (state === 'overdue') {
    const late = Math.abs(days)
    return `Overdue by ${late} ${late === 1 ? 'day' : 'days'}${what}`
  }
  if (state === 'due') return `Due today${what}`
  return `Due in ${days} ${days === 1 ? 'day' : 'days'}${what}`
}

/**
 * The same commitment at glance length, for a chip beside a name.
 * Returns an empty string when there is no commitment.
 */
export function followUpBrief(state, days) {
  if (!state) return ''
  if (state === 'overdue') return `${Math.abs(days)}d overdue`
  if (state === 'due') return 'due today'
  return `in ${days}d`
}

/**
 * The ink token the commitment reads in. Only what is owed earns colour;
 * everything else stays in the muted tone the rest of the row uses.
 */
export function followUpTone(state) {
  if (state === 'overdue') return 'text-danger'
  if (state === 'due') return 'text-accent'
  return 'text-ink-3'
}
