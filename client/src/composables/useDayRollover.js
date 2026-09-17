import { getCurrentInstance, onUnmounted } from 'vue'

/** A minute is fine-grained enough: the classification is whole days. */
const CHECK_INTERVAL_MS = 60000

/** The local calendar date (YYYY-MM-DD) at epoch ms `ms`. */
export function localCalendarDate(ms) {
  const at = new Date(ms)
  return new Date(ms - at.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/**
 * Calls `onRollover` once each time the local calendar date changes under an
 * open session.
 *
 * Follow-up state is derived server-side, so a board left open past midnight
 * keeps showing yesterday's "due today". The client does not reclassify; it
 * only notices the date moved so the caller can refetch (same shape as the
 * detector in PeopleView.vue, with the timers injectable for tests).
 *
 * options:
 *   now()                           - clock seam, defaults to Date.now
 *   setIntervalFn / clearIntervalFn - timer seams, default to the globals
 *
 * Returns `stop()`. Teardown is automatic inside a component; call `stop()`
 * directly otherwise.
 */
export function useDayRollover(onRollover, options = {}) {
  const {
    now = () => Date.now(),
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
  } = options

  let currentDay = localCalendarDate(now())
  let timer = setIntervalFn(() => {
    const day = localCalendarDate(now())
    if (day === currentDay) return
    currentDay = day
    onRollover()
  }, CHECK_INTERVAL_MS)

  function stop() {
    if (timer === null) return
    clearIntervalFn(timer)
    timer = null
  }

  if (getCurrentInstance()) onUnmounted(stop)

  return { stop }
}
