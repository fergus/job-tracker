import { test } from 'node:test'
import assert from 'node:assert'
import { STAGE_ORDER, TERMINAL_STAGES, isTerminal, stageColor, computeSegments, durationDays } from './timeline.js'

test('STAGE_ORDER contains the five active stages in pipeline order', () => {
  assert.deepStrictEqual(STAGE_ORDER, ['interested', 'applied', 'screening', 'interview', 'offer'])
})

test('TERMINAL_STAGES contains accepted and rejected', () => {
  assert.deepStrictEqual(TERMINAL_STAGES, ['accepted', 'rejected'])
})

test('isTerminal returns true for terminal statuses', () => {
  assert.strictEqual(isTerminal('accepted'), true)
  assert.strictEqual(isTerminal('rejected'), true)
})

test('isTerminal returns false for active statuses', () => {
  assert.strictEqual(isTerminal('interested'), false)
  assert.strictEqual(isTerminal('applied'), false)
  assert.strictEqual(isTerminal('screening'), false)
  assert.strictEqual(isTerminal('interview'), false)
  assert.strictEqual(isTerminal('offer'), false)
})

test('isTerminal returns false for unknown statuses', () => {
  assert.strictEqual(isTerminal('archived'), false)
  assert.strictEqual(isTerminal(''), false)
  assert.strictEqual(isTerminal(undefined), false)
  assert.strictEqual(isTerminal(null), false)
})

test('stageColor returns a CSS var reference', () => {
  assert.strictEqual(stageColor('interested'), 'var(--stage-interested, oklch(57% 0.04 240))')
  assert.strictEqual(stageColor('applied'), 'var(--stage-applied, oklch(57% 0.04 240))')
})

test('computeSegments builds stage segments from date transitions', () => {
  const app = {
    status: 'interview',
    interested_at: '2026-01-01T00:00:00Z',
    applied_at: '2026-01-10T00:00:00Z',
    screening_at: '2026-01-20T00:00:00Z',
    interview_at: '2026-02-01T00:00:00Z',
  }
  const segments = computeSegments(app, '2026-04-01T00:00:00Z')

  assert.strictEqual(segments.length, 4)

  assert.strictEqual(segments[0].stage, 'interested')
  assert.strictEqual(segments[0].start, '2026-01-01T00:00:00Z')
  assert.strictEqual(segments[0].end, '2026-01-10T00:00:00Z')
  assert.strictEqual(segments[0].isTrailing, false)

  assert.strictEqual(segments[1].stage, 'applied')
  assert.strictEqual(segments[1].start, '2026-01-10T00:00:00Z')
  assert.strictEqual(segments[1].end, '2026-01-20T00:00:00Z')

  assert.strictEqual(segments[2].stage, 'screening')
  assert.strictEqual(segments[2].start, '2026-01-20T00:00:00Z')
  assert.strictEqual(segments[2].end, '2026-02-01T00:00:00Z')

  assert.strictEqual(segments[3].stage, 'interview')
  assert.strictEqual(segments[3].start, '2026-02-01T00:00:00Z')
  assert.strictEqual(segments[3].isTrailing, true)
})

test('computeSegments marks last segment as trailing for active apps', () => {
  const app = {
    status: 'interview',
    interested_at: '2026-01-01T00:00:00Z',
    applied_at: '2026-01-10T00:00:00Z',
  }
  const segments = computeSegments(app, '2026-04-01T00:00:00Z')

  assert.strictEqual(segments.length, 2)
  assert.strictEqual(segments[0].stage, 'interested')
  assert.strictEqual(segments[0].isTrailing, false)
  assert.strictEqual(segments[1].stage, 'applied')
  assert.strictEqual(segments[1].isTrailing, true)
})

test('computeSegments adds terminal segment for closed apps', () => {
  const app = {
    status: 'rejected',
    interested_at: '2026-01-01T00:00:00Z',
    applied_at: '2026-01-10T00:00:00Z',
    closed_at: '2026-02-01T00:00:00Z',
  }
  const segments = computeSegments(app, '2026-04-01T00:00:00Z')

  const last = segments[segments.length - 1]
  assert.strictEqual(last.stage, 'rejected')
  assert.strictEqual(last.start, '2026-02-01T00:00:00Z')
  assert.strictEqual(last.end, '2026-02-01T00:00:00Z')
  assert.strictEqual(last.isTrailing, false)
})

test('computeSegments uses today as trailing end when no terminal date', () => {
  const app = {
    status: 'interested',
    interested_at: '2026-01-01T00:00:00Z',
  }
  const today = '2026-04-01T00:00:00Z'
  const segments = computeSegments(app, today)

  assert.strictEqual(segments[0].end, today)
})

test('durationDays calculates whole days between two dates', () => {
  assert.strictEqual(durationDays('2026-04-01T00:00:00Z', '2026-04-10T00:00:00Z'), 9)
  assert.strictEqual(durationDays('2026-04-01T00:00:00Z', '2026-04-01T00:00:00Z'), 0)
})

test('durationDays never returns negative', () => {
  assert.strictEqual(durationDays('2026-04-10T00:00:00Z', '2026-04-01T00:00:00Z'), 0)
})

test('computeSegments adds terminal segment for accepted apps', () => {
  const app = {
    status: 'accepted',
    interested_at: '2026-01-01T00:00:00Z',
    applied_at: '2026-01-10T00:00:00Z',
    closed_at: '2026-02-01T00:00:00Z',
  }
  const segments = computeSegments(app, '2026-04-01T00:00:00Z')

  const last = segments[segments.length - 1]
  assert.strictEqual(last.stage, 'accepted')
  assert.strictEqual(last.start, '2026-02-01T00:00:00Z')
  assert.strictEqual(last.end, '2026-02-01T00:00:00Z')
  assert.strictEqual(last.isTrailing, false)
})
