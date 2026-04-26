import { test } from 'node:test'
import assert from 'node:assert'
import { partitionClosed } from './closedPartition.js'

const NOW = new Date('2026-04-25T00:00:00Z').getTime()

function app(overrides) {
  return { id: 1, status: 'accepted', updated_at: '2026-04-20T00:00:00Z', ...overrides }
}

test('splits recent (< 14 days) from older (>= 14 days)', () => {
  const recent = [app({ id: 1, updated_at: '2026-04-20T00:00:00Z' })]
  const older = [app({ id: 2, updated_at: '2026-04-01T00:00:00Z' })]
  const result = partitionClosed([...recent, ...older], NOW)

  assert.deepStrictEqual(result.recent.map(a => a.id), [1])
  assert.deepStrictEqual(result.older.map(a => a.id), [2])
})

test('14-day boundary is exclusive for recent', () => {
  const exactly14 = app({ id: 3, updated_at: '2026-04-11T00:00:00Z' })
  const result = partitionClosed([exactly14], NOW)

  assert.strictEqual(result.recent.length, 0)
  assert.strictEqual(result.older.length, 1)
})

test('uses closed_at when present, then falls back to updated_at', () => {
  const a = app({
    id: 4,
    status: 'accepted',
    closed_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  })
  const result = partitionClosed([a], NOW)
  assert.strictEqual(result.recent.length, 1)

  const b = app({
    id: 5,
    status: 'accepted',
    closed_at: undefined,
    updated_at: '2026-04-20T00:00:00Z',
  })
  const result2 = partitionClosed([b], NOW)
  assert.strictEqual(result2.recent.length, 1)
})

test('rejected app uses closed_at, then updated_at', () => {
  const a = app({
    id: 6,
    status: 'rejected',
    closed_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  })
  const result = partitionClosed([a], NOW)
  assert.strictEqual(result.recent.length, 1)

  const b = app({
    id: 7,
    status: 'rejected',
    closed_at: undefined,
    updated_at: '2026-03-01T00:00:00Z',
  })
  const result2 = partitionClosed([b], NOW)
  assert.strictEqual(result2.recent.length, 0)
  assert.strictEqual(result2.older.length, 1)

  const c = app({
    id: 8,
    status: 'rejected',
    closed_at: undefined,
    updated_at: '2026-04-20T00:00:00Z',
  })
  const result3 = partitionClosed([c], NOW)
  assert.strictEqual(result3.recent.length, 1)
})

test('treats missing dates as epoch (very old)', () => {
  const result = partitionClosed([app({ id: 9, updated_at: undefined })], NOW)
  assert.strictEqual(result.recent.length, 0)
  assert.strictEqual(result.older.length, 1)
})

test('preserves input order within each bucket', () => {
  const apps = [
    app({ id: 10, updated_at: '2026-04-20T00:00:00Z' }),
    app({ id: 11, updated_at: '2026-04-01T00:00:00Z' }),
    app({ id: 12, updated_at: '2026-04-19T00:00:00Z' }),
    app({ id: 13, updated_at: '2026-04-02T00:00:00Z' }),
  ]
  const result = partitionClosed(apps, NOW)
  assert.deepStrictEqual(result.recent.map(a => a.id), [10, 12])
  assert.deepStrictEqual(result.older.map(a => a.id), [11, 13])
})

test('empty array returns both buckets empty', () => {
  const result = partitionClosed([], NOW)
  assert.deepStrictEqual(result.recent, [])
  assert.deepStrictEqual(result.older, [])
})

test('mixed accepted and rejected apps partition correctly', () => {
  const apps = [
    app({ id: 20, status: 'accepted', closed_at: '2026-04-20T00:00:00Z', updated_at: '2026-03-01T00:00:00Z' }),
    app({ id: 21, status: 'rejected', closed_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-20T00:00:00Z' }),
    app({ id: 22, status: 'accepted', closed_at: undefined, updated_at: '2026-04-19T00:00:00Z' }),
    app({ id: 23, status: 'rejected', closed_at: undefined, updated_at: '2026-03-01T00:00:00Z' }),
  ]
  const result = partitionClosed(apps, NOW)
  assert.deepStrictEqual(result.recent.map(a => a.id), [20, 22])
  assert.deepStrictEqual(result.older.map(a => a.id), [21, 23])
})

test('invalid date strings are treated as epoch (very old)', () => {
  const apps = [
    app({ id: 30, status: 'accepted', closed_at: 'not-a-date', updated_at: 'also-bad' }),
    app({ id: 31, status: 'rejected', closed_at: 'invalid', updated_at: 'nope' }),
  ]
  const result = partitionClosed(apps, NOW)
  assert.strictEqual(result.recent.length, 0)
  assert.strictEqual(result.older.length, 2)
})

test('null dates are treated as missing', () => {
  const result = partitionClosed([app({ id: 40, status: 'accepted', closed_at: null, updated_at: null })], NOW)
  assert.strictEqual(result.recent.length, 0)
  assert.strictEqual(result.older.length, 1)
})

test('unexpected status falls back to updated_at', () => {
  const a = app({ id: 50, status: 'archived', closed_at: undefined, updated_at: '2026-04-20T00:00:00Z' })
  const result = partitionClosed([a], NOW)
  assert.strictEqual(result.recent.length, 1)

  const b = app({ id: 51, status: 'archived', closed_at: null, updated_at: '2026-04-20T00:00:00Z' })
  const result2 = partitionClosed([b], NOW)
  assert.strictEqual(result2.recent.length, 1)
})

test('all-null timestamps sort to older (epoch fallback)', () => {
  const a = app({ id: 60, status: 'accepted', closed_at: null, updated_at: null })
  const b = app({ id: 61, status: 'rejected', closed_at: null, updated_at: null })
  const result = partitionClosed([a, b], NOW)
  assert.strictEqual(result.recent.length, 0)
  assert.strictEqual(result.older.length, 2)
  assert.deepStrictEqual(result.older.map(x => x.id), [60, 61])
})
