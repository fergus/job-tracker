import { test } from 'node:test'
import assert from 'node:assert'
import { cardSignal } from './cardSignal.js'
import { formatRelativeDate } from './date.js'

// formatRelativeDate reads the real clock, so the injected time is the real
// one captured once; staleness ages are then exact offsets from it.
const NOW = Date.now()
const DAY = 86_400_000

function app(overrides) {
  return {
    id: 1,
    status: 'applied',
    updated_at: new Date(NOW - 25 * DAY).toISOString(),
    next_action_at: null,
    follow_up_state: null,
    follow_up_days: null,
    ...overrides,
  }
}

// What KanbanCard.vue rendered in its slot before the follow-up date existed,
// kept verbatim so the no-date path is proven unchanged.
const STALE_STAGES = new Set(['applied', 'responded', 'interview', 'offer'])
function legacySlot(application, now) {
  const staleDays = STALE_STAGES.has(application.status)
    ? (now - new Date(application.updated_at)) / 86_400_000
    : 0
  const level = staleDays >= 30 ? 2 : staleDays >= 14 ? 1 : 0
  const tone = level === 2 ? 'text-danger' : level === 1 ? 'text-accent' : 'text-ink-3'
  const dot = level === 0 ? null : level === 2 ? 'bg-danger' : 'bg-accent'
  let title = ''
  if (level > 0) {
    const duration = staleDays >= 60
      ? `${Math.round(staleDays / 30)} months`
      : staleDays >= 30 ? '1 month' : `${Math.round(staleDays)} days`
    title = level === 2 ? `No movement in ${duration} — worth following up` : `No movement in ${duration}`
  }
  return { text: formatRelativeDate(application.updated_at), tone, dot, title }
}

function slot(signal) {
  const { text, tone, dot, title } = signal
  return { text, tone, dot, title }
}

test('AE4: an applied record idle 25 days with no date shows staleness', () => {
  const signal = cardSignal(app(), NOW)

  assert.strictEqual(signal.kind, 'staleness')
  assert.strictEqual(signal.tone, 'text-accent')
  assert.strictEqual(signal.dot, 'bg-accent')
  assert.strictEqual(signal.title, 'No movement in 25 days')
})

test('AE4: the same record with a date three days out shows the follow-up and no staleness', () => {
  const signal = cardSignal(
    app({ next_action_at: '2099-01-04', follow_up_state: 'upcoming', follow_up_days: 3 }),
    NOW,
  )

  assert.strictEqual(signal.kind, 'follow-up')
  assert.strictEqual(signal.text, 'in 3d')
  assert.strictEqual(signal.title, 'Due in 3 days')
  assert.strictEqual(signal.tone, 'text-ink-3')
  assert.strictEqual(signal.dot, null)
  assert.ok(!signal.title.includes('No movement'))
})

test('AE5: clearing the date brings the 25-day staleness back', () => {
  const dated = app({ next_action_at: '2099-01-04', follow_up_state: 'upcoming', follow_up_days: 3 })
  const cleared = { ...dated, next_action_at: null, follow_up_state: null, follow_up_days: null }

  const signal = cardSignal(cleared, NOW)

  assert.strictEqual(signal.kind, 'staleness')
  assert.strictEqual(signal.title, 'No movement in 25 days')
  assert.deepStrictEqual(slot(signal), legacySlot(cleared, NOW))
})

test('AE1: a record the server reports one day overdue says so in the danger tone', () => {
  const signal = cardSignal(
    app({ next_action_at: '2026-01-01', follow_up_state: 'overdue', follow_up_days: -1 }),
    NOW,
  )

  assert.strictEqual(signal.text, '1d overdue')
  assert.strictEqual(signal.title, 'Overdue by 1 day')
  assert.strictEqual(signal.tone, 'text-danger')
  assert.strictEqual(signal.dot, 'bg-danger')
})

test('a record due today reads "due today" in the accent tone', () => {
  const signal = cardSignal(
    app({ next_action_at: '2026-01-01', follow_up_state: 'due', follow_up_days: 0 }),
    NOW,
  )

  assert.strictEqual(signal.text, 'due today')
  assert.strictEqual(signal.title, 'Due today')
  assert.strictEqual(signal.tone, 'text-accent')
  assert.strictEqual(signal.dot, 'bg-accent')
})

test('a closed record with a follow-up date still shows the follow-up', () => {
  const signal = cardSignal(
    app({ status: 'rejected', next_action_at: '2099-01-10', follow_up_state: 'upcoming', follow_up_days: 9 }),
    NOW,
  )

  assert.strictEqual(signal.kind, 'follow-up')
  assert.strictEqual(signal.text, 'in 9d')
})

test('the card never computes the state itself: a stale date string is ignored', () => {
  // The server classification is the only input (R5); a date with no state
  // falls back to staleness rather than being reclassified on the client.
  const signal = cardSignal(app({ next_action_at: '2000-01-01' }), NOW)

  assert.strictEqual(signal.kind, 'staleness')
})

for (const status of ['applied', 'offer', 'interested', 'accepted', 'rejected']) {
  for (const days of [0, 14, 30, 75]) {
    test(`no date: ${status} idle ${days} days matches the previous card output`, () => {
      const record = app({ status, updated_at: new Date(NOW - days * DAY).toISOString() })

      assert.deepStrictEqual(slot(cardSignal(record, NOW)), legacySlot(record, NOW))
    })
  }
}

test('no date: the thresholds land where they did (level 0, 1, 2)', () => {
  const at = (days) => cardSignal(app({ updated_at: new Date(NOW - days * DAY).toISOString() }), NOW)

  assert.deepStrictEqual([at(13).dot, at(14).dot, at(30).dot], [null, 'bg-accent', 'bg-danger'])
  assert.strictEqual(at(13).title, '')
  assert.strictEqual(at(30).title, 'No movement in 1 month — worth following up')
})
