import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { groupContacts, contactedProse, GROUP_ORDER } from './contactGroups.js'

const person = (name, extra = {}) => ({
  id: name,
  name,
  follow_up_state: null,
  follow_up_days: null,
  last_contacted_at: null,
  days_since_contact: null,
  ...extra,
})

const namesIn = (groups, key) =>
  (groups.find((g) => g.key === key)?.contacts ?? []).map((c) => c.name)

describe('grouping the contact list', () => {
  test('maps the three server states onto four groups, in order', () => {
    const groups = groupContacts([
      person('Upcoming Person', { follow_up_state: 'upcoming', follow_up_days: 4 }),
      person('Nobody Owed'),
      person('Overdue Person', { follow_up_state: 'overdue', follow_up_days: -2 }),
      person('Today Person', { follow_up_state: 'due', follow_up_days: 0 }),
    ])
    assert.deepEqual(
      groups.map((g) => g.key),
      GROUP_ORDER,
    )
    assert.deepEqual(namesIn(groups, 'overdue'), ['Overdue Person'])
    assert.deepEqual(namesIn(groups, 'due'), ['Today Person'])
    assert.deepEqual(namesIn(groups, 'upcoming'), ['Upcoming Person'])
    assert.deepEqual(namesIn(groups, 'none'), ['Nobody Owed'])
  })

  test('a dated group with no one in it is omitted; no commitment always renders', () => {
    const groups = groupContacts([
      person('Only Overdue', { follow_up_state: 'overdue', follow_up_days: -1 }),
    ])
    assert.deepEqual(
      groups.map((g) => g.key),
      ['overdue', 'none'],
    )
    assert.deepEqual(namesIn(groups, 'none'), [])
  })

  test('an empty list still offers the no-commitment group', () => {
    const groups = groupContacts([])
    assert.deepEqual(
      groups.map((g) => g.key),
      ['none'],
    )
  })

  test('server order is authoritative within a group', () => {
    // The server sorts the no-commitment tail longest-quiet first with the
    // never-contacted last. Re-sorting here would silently override it.
    const groups = groupContacts([
      person('Eight Months', { last_contacted_at: '2026-01-01', days_since_contact: 240 }),
      person('Three Weeks', { last_contacted_at: '2026-08-18', days_since_contact: 21 }),
      person('Never Contacted'),
    ])
    assert.deepEqual(namesIn(groups, 'none'), [
      'Eight Months',
      'Three Weeks',
      'Never Contacted',
    ])
  })

  test('walks the list once, whatever states it holds', () => {
    const list = [
      person('A', { follow_up_state: 'overdue', follow_up_days: -1 }),
      person('B', { follow_up_state: 'due', follow_up_days: 0 }),
      person('C', { follow_up_state: 'upcoming', follow_up_days: 3 }),
      person('D'),
    ]
    let reads = 0
    const counted = new Proxy(list, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) reads++
        return Reflect.get(target, prop, receiver)
      },
    })
    groupContacts(counted)
    assert.equal(reads, list.length)
  })

  test('a missing list is an empty one, not a crash', () => {
    assert.deepEqual(
      groupContacts(undefined).map((g) => g.key),
      ['none'],
    )
  })
})

describe('the elapsed-contact wording', () => {
  const TODAY = '2026-09-09'

  test('says never rather than showing a duration', () => {
    assert.equal(contactedProse(null, TODAY), 'Never contacted')
    assert.equal(contactedProse('', TODAY), 'Never contacted')
  })

  test('reads as today on the day', () => {
    assert.equal(contactedProse('2026-09-09', TODAY), 'Last contacted today')
  })

  test('a date in the future reads as today, never as negative time', () => {
    assert.equal(contactedProse('2026-09-11', TODAY), 'Last contacted today')
  })

  test('scales from days to weeks to months', () => {
    assert.equal(contactedProse('2026-09-06', TODAY), 'Last contacted 3 days ago')
    assert.equal(contactedProse('2026-09-08', TODAY), 'Last contacted 1 day ago')
    assert.equal(contactedProse('2026-08-19', TODAY), 'Last contacted 3 weeks ago')
    assert.equal(contactedProse('2026-09-02', TODAY), 'Last contacted 1 week ago')
    assert.equal(contactedProse('2026-01-12', TODAY), 'Last contacted 8 months ago')
    assert.equal(contactedProse('2025-09-09', TODAY), 'Last contacted 12 months ago')
  })
})
