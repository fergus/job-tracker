import { test } from 'node:test'
import assert from 'node:assert'
import { useDayRollover } from './useDayRollover.js'

// A manual clock and interval so nothing waits on real time. Dates are built
// in local time because the detector watches the local calendar date.
function harness() {
  const clock = { now: new Date(2026, 7, 8, 23, 58, 0).getTime() }
  const intervals = []
  const cleared = []
  let nextId = 1
  const fired = []

  const rollover = useDayRollover(() => fired.push(clock.now), {
    now: () => clock.now,
    setIntervalFn: (fn, ms) => {
      const id = nextId++
      intervals.push({ id, fn, ms })
      return id
    },
    clearIntervalFn: (id) => cleared.push(id),
  })

  return {
    rollover,
    clock,
    intervals,
    cleared,
    fired,
    // Ticks only intervals not yet cleared, like a real timer would.
    tick(ms) {
      clock.now += ms
      for (const entry of intervals) {
        if (!cleared.includes(entry.id)) entry.fn()
      }
    },
  }
}

test('does not fire while the local date stays the same', () => {
  const h = harness()

  h.tick(60000)

  assert.strictEqual(h.fired.length, 0)
  h.rollover.stop()
})

test('fires once when the clock crosses midnight', () => {
  const h = harness()

  h.tick(60000)
  h.tick(60000) // 00:00 on the next day
  h.tick(60000)
  h.tick(60000)

  assert.strictEqual(h.fired.length, 1)
  h.rollover.stop()
})

test('fires again on the following midnight', () => {
  const h = harness()

  h.tick(2 * 60000)
  h.tick(24 * 60 * 60000)

  assert.strictEqual(h.fired.length, 2)
  h.rollover.stop()
})

test('checks once a minute', () => {
  const h = harness()

  assert.strictEqual(h.intervals.length, 1)
  assert.strictEqual(h.intervals[0].ms, 60000)
  h.rollover.stop()
})

test('stop clears the interval and nothing fires afterwards', () => {
  const h = harness()
  const id = h.intervals[0].id

  h.rollover.stop()
  h.rollover.stop()
  h.tick(24 * 60 * 60000)

  assert.deepStrictEqual(h.cleared, [id])
  assert.strictEqual(h.fired.length, 0)
})
