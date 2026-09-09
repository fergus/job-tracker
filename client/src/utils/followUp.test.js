import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { followUpProse, followUpBrief, followUpTone } from './followUp.js'

// These assertions pin wording that shipped before the formatter was extracted
// and that an end-to-end test reads off the screen. Changing a string here is
// changing what the user sees, not tidying a test.
describe('the follow-up sentence', () => {
  test('states how overdue a commitment is, and what it was', () => {
    assert.equal(
      followUpProse('overdue', -3, 'Chase the shortlist'),
      'Overdue by 3 days: Chase the shortlist',
    )
  })

  test('says day, not days, at one', () => {
    assert.equal(followUpProse('overdue', -1, null), 'Overdue by 1 day')
    assert.equal(followUpProse('upcoming', 1, null), 'Due in 1 day')
  })

  test('reads as due today on the day', () => {
    assert.equal(followUpProse('due', 0, 'Call her back'), 'Due today: Call her back')
    assert.equal(followUpProse('due', 0, null), 'Due today')
  })

  test('counts down to an upcoming commitment', () => {
    assert.equal(
      followUpProse('upcoming', 5, 'Chase the shortlist decision'),
      'Due in 5 days: Chase the shortlist decision',
    )
  })

  test('a date with no wording renders without a trailing separator', () => {
    assert.equal(followUpProse('upcoming', 4, ''), 'Due in 4 days')
    assert.equal(followUpProse('overdue', -2, undefined), 'Overdue by 2 days')
  })

  test('no commitment yields nothing to say', () => {
    assert.equal(followUpProse(null, null, 'ignored'), '')
    assert.equal(followUpProse(undefined, null, null), '')
  })
})

describe('the glance-length form', () => {
  test('compresses each state to a chip', () => {
    assert.equal(followUpBrief('overdue', -3), '3d overdue')
    assert.equal(followUpBrief('due', 0), 'due today')
    assert.equal(followUpBrief('upcoming', 5), 'in 5d')
    assert.equal(followUpBrief(null, null), '')
  })
})

describe('the tone', () => {
  test('gives colour only to what is owed', () => {
    assert.equal(followUpTone('overdue'), 'text-danger')
    assert.equal(followUpTone('due'), 'text-accent')
    assert.equal(followUpTone('upcoming'), 'text-ink-3')
    assert.equal(followUpTone(null), 'text-ink-3')
  })
})
