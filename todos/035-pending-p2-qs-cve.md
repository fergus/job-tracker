# Pending: qs CVE — Moderate DoS Vulnerability
**Created:** 2026-05-22
**Priority:** P2 (moderate CVE, should fix soon)
**Status:** pending
**Module:** server

## What
`qs` 6.11.1 - 6.15.1 has a remotely triggerable DoS: `qs.stringify` crashes with TypeError on null/undefined entries in comma-format arrays when `encodeValuesOnly` is set.

- CVE: GHSA-q8mj-m7cp-5q26
- CVSS: 5.3 (Moderate)
- CWE-476 (NULL Pointer Dereference)
- `fixAvailable`: true (via `npm audit fix`)

## Action
Run `cd server && npm audit fix` to update the transitive `qs` dependency. The fix is available in a newer patch version.

## Context
Found during weekly dependency check 2026-05-22. `qs` is a transitive dependency (not direct) in the server package.
