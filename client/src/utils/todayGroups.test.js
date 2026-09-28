import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { groupToday, kindLabel, TODAY_GROUP_ORDER } from './todayGroups.js'

const item = (title, state, kind = 'application') => ({
  kind,
  id: title,
  title,
  follow_up_state: state,
})

describe('groupToday', () => {
  test('orders groups Overdue, Today, This week', () => {
    const groups = groupToday([
      item('c', 'upcoming'),
      item('a', 'overdue'),
      item('b', 'due', 'contact'),
    ])
    assert.deepEqual(
      groups.map((g) => g.label),
      ['Overdue', 'Today', 'This week'],
    )
    assert.deepEqual(TODAY_GROUP_ORDER, ['overdue', 'due', 'upcoming'])
  })

  test('keeps the server order within a group, never re-sorting', () => {
    const groups = groupToday([
      item('zulu', 'overdue'),
      item('alpha', 'overdue', 'contact'),
      item('mike', 'overdue'),
    ])
    assert.deepEqual(
      groups[0].items.map((i) => i.title),
      ['zulu', 'alpha', 'mike'],
    )
  })

  test('omits an empty group', () => {
    const groups = groupToday([item('a', 'overdue'), item('b', 'upcoming')])
    assert.deepEqual(
      groups.map((g) => g.key),
      ['overdue', 'upcoming'],
    )
  })

  test('an empty list yields no groups', () => {
    assert.deepEqual(groupToday([]), [])
    assert.deepEqual(groupToday(undefined), [])
  })

  test('drops an item with no or an unknown state rather than crashing', () => {
    const groups = groupToday([item('a', null), item('b', 'someday'), item('c', 'due')])
    assert.deepEqual(
      groups.map((g) => [g.key, g.items.length]),
      [['due', 1]],
    )
  })

  test('headings carry no counts', () => {
    for (const g of groupToday([item('a', 'overdue'), item('b', 'overdue')])) {
      assert.doesNotMatch(g.label, /\d/)
    }
  })
})

describe('kindLabel', () => {
  test('names a person, a lead and a role in words', () => {
    assert.equal(kindLabel({ kind: 'contact' }), 'Person')
    assert.equal(kindLabel({ kind: 'application', record_type: 'lead' }), 'Lead')
    assert.equal(kindLabel({ kind: 'application', record_type: 'application' }), 'Role')
  })
})
