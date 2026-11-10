/**
 * Header search over the people and roles the client already holds.
 *
 * Pure module. Matching runs in the browser because both lists arrive whole,
 * so a keystroke never waits on a request. People match on name, employer,
 * role, email and phone; roles match on company and title. Open records come
 * before closed ones, then names or companies that start with the query, then
 * alphabetical order. Each group is capped so the box stays readable mid-call.
 */

import { isTerminal } from './timeline.js'

/** Most results shown per group; the rest are counted, not listed. */
export const GROUP_LIMIT = 8

// A query is only treated as a phone number when it looks like one: digits
// plus the punctuation people type in numbers, and at least three digits, so
// "04" does not match every mobile in the list.
const PHONE_CHARS = /^[\d\s+()\-.]+$/
const MIN_PHONE_DIGITS = 3

/** Lowercase and strip accents, so "Zoe" finds "Zoë". */
function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const digitsOf = (value) => String(value ?? '').replace(/\D/g, '')

/**
 * The digit strings a phone query may appear as inside a stored number.
 * A leading 0 is a national trunk prefix, so it is dropped. A query written
 * with + or 00 carries a country code of one to three digits that a number
 * stored in national form will not have, so each length is tried.
 */
function phoneVariants(raw) {
  const trimmed = raw.trim()
  if (!PHONE_CHARS.test(trimmed)) return []
  let digits = digitsOf(trimmed)
  if (digits.length < MIN_PHONE_DIGITS) return []

  const international = trimmed.startsWith('+') || trimmed.startsWith('00')
  if (trimmed.startsWith('00')) digits = digits.slice(2)
  const variants = new Set([digits.replace(/^0+/, '')])
  if (international) {
    for (const cut of [1, 2, 3]) variants.add(digits.slice(cut))
  }
  return [...variants].filter((v) => v.length >= MIN_PHONE_DIGITS)
}

function rank(matches, primary) {
  return matches.sort((a, b) => {
    if (a.closed !== b.closed) return a.closed ? 1 : -1
    if (a.starts !== b.starts) return a.starts ? -1 : 1
    return fold(primary(a)).localeCompare(fold(primary(b)))
  })
}

function cap(matches) {
  return {
    items: matches.slice(0, GROUP_LIMIT),
    hidden: Math.max(0, matches.length - GROUP_LIMIT),
  }
}

function matchPeople(q, phones, contacts) {
  const out = []
  for (const c of contacts) {
    const text = [c.name, c.employer, c.contact_role, c.email].some((f) =>
      fold(f).includes(q),
    )
    const stored = phones.length ? digitsOf(c.phone) : ''
    const phone = stored !== '' && phones.some((v) => stored.includes(v))
    if (!text && !phone) continue
    out.push({
      kind: 'person',
      id: c.id,
      name: c.name,
      detail: c.employer || c.contact_role || '',
      closed: false,
      starts: fold(c.name).startsWith(q),
      record: c,
    })
  }
  return cap(rank(out, (p) => p.name))
}

function matchRoles(q, applications) {
  const out = []
  for (const a of applications) {
    if (!fold(a.company_name).includes(q) && !fold(a.role_title).includes(q)) {
      continue
    }
    out.push({
      kind: 'role',
      id: a.id,
      company: a.company_name,
      title: a.role_title || '',
      lead: a.record_type === 'lead',
      closed: isTerminal(a),
      starts: fold(a.company_name).startsWith(q),
      record: a,
    })
  }
  return cap(rank(out, (r) => r.company))
}

/**
 * Search both lists. Returns `{ people, roles }`, each `{ items, hidden }`.
 * An empty query returns empty groups rather than everything.
 */
export function searchRecords(query, applications = [], contacts = []) {
  const q = fold(query).trim()
  if (!q) {
    return { people: { items: [], hidden: 0 }, roles: { items: [], hidden: 0 } }
  }
  return {
    people: matchPeople(q, phoneVariants(String(query)), contacts),
    roles: matchRoles(q, applications),
  }
}
