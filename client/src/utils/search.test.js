import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { searchRecords, GROUP_LIMIT } from './search.js'

const contact = (id, name, extra = {}) => ({
  id,
  name,
  employer: null,
  contact_role: null,
  email: null,
  phone: null,
  ...extra,
})

const role = (id, company_name, extra = {}) => ({
  id,
  company_name,
  role_title: 'Engineer',
  record_type: 'application',
  state: 'open',
  ...extra,
})

const peopleNames = (r) => r.people.items.map((p) => p.name)
const roleIds = (r) => r.roles.items.map((a) => a.id)

describe('matching people', () => {
  test('matches name and employer anywhere in the field, ignoring case', () => {
    const r = searchRecords('smi', [], [
      contact(1, 'Jo Smith'),
      contact(2, 'Ana Lee', { employer: 'Smithfield' }),
      contact(3, 'Bo Chan', { employer: 'Acme' }),
    ])
    assert.deepEqual(peopleNames(r).sort(), ['Ana Lee', 'Jo Smith'])
  })

  test('matches role and email', () => {
    const people = [
      contact(1, 'Jo Smith', { email: 'jo@acme.com' }),
      contact(2, 'Ana Lee', { contact_role: 'Recruiter' }),
    ]
    assert.deepEqual(peopleNames(searchRecords('jo@acme', [], people)), ['Jo Smith'])
    assert.deepEqual(peopleNames(searchRecords('RECRUIT', [], people)), ['Ana Lee'])
  })

  test('strips accents so Zoe finds Zoë', () => {
    const r = searchRecords('Zoe', [], [contact(1, 'Zoë Park')])
    assert.deepEqual(peopleNames(r), ['Zoë Park'])
  })

  test('ranks names that start with the query above names that contain it', () => {
    const r = searchRecords('jo', [], [contact(1, 'Majo Lee'), contact(2, 'Jo Smith')])
    assert.deepEqual(peopleNames(r), ['Jo Smith', 'Majo Lee'])
  })

  test('caps each group and reports how many were left out', () => {
    const many = Array.from({ length: GROUP_LIMIT + 4 }, (_, i) =>
      contact(i, `Person ${String(i).padStart(2, '0')}`))
    const r = searchRecords('person', [], many)
    assert.equal(r.people.items.length, GROUP_LIMIT)
    assert.equal(r.people.hidden, 4)
  })
})

describe('matching phone numbers', () => {
  const intl = [contact(1, 'Jo Smith', { phone: '+61 412 345 678' })]
  const local = [contact(1, 'Jo Smith', { phone: '0412 345 678' })]

  test('a national number with a leading 0 finds the stored international form', () => {
    assert.deepEqual(peopleNames(searchRecords('0412 345', [], intl)), ['Jo Smith'])
    assert.deepEqual(peopleNames(searchRecords('412345', [], intl)), ['Jo Smith'])
    assert.deepEqual(peopleNames(searchRecords('+61 412', [], intl)), ['Jo Smith'])
  })

  test('an international query finds the stored national form', () => {
    assert.deepEqual(peopleNames(searchRecords('+61 412 345', [], local)), ['Jo Smith'])
  })

  test('fewer than three digits does not match on phone', () => {
    assert.deepEqual(peopleNames(searchRecords('04', [], local)), [])
  })
})

describe('matching roles', () => {
  test('matches company and title, and flags leads and closed records', () => {
    const r = searchRecords('acme', [
      role(1, 'Acme', { state: 'closed' }),
      role(2, 'Acme', { record_type: 'lead' }),
      role(3, 'Globex', { role_title: 'Acme Liaison' }),
      role(4, 'Initech'),
    ], [])
    assert.deepEqual(roleIds(r), [2, 3, 1])
    const byId = Object.fromEntries(r.roles.items.map((a) => [a.id, a]))
    assert.equal(byId[1].closed, true)
    assert.equal(byId[2].lead, true)
    assert.equal(byId[2].closed, false)
  })

  test('an empty query or a miss returns empty groups', () => {
    const apps = [role(1, 'Acme')]
    const people = [contact(1, 'Jo Smith')]
    for (const q of ['', '   ', 'zzqx']) {
      const r = searchRecords(q, apps, people)
      assert.equal(r.people.items.length, 0)
      assert.equal(r.roles.items.length, 0)
    }
  })
})
