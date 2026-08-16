# Fix client CVE (nanoid high)

- **Priority:** p2
- **Created:** 2026-08-14
- **Category:** Security

## Problem

`npm audit` on `client/` reports 1 vulnerability:

| Package | Severity | Type | Fix |
|---------|----------|------|-----|
| `nanoid` | **HIGH** | Transitive (via vite → postcss) | 3.3.18 (`npm audit fix`, within range) |

## Current

- `nanoid@3.3.16` — custom generators can loop indefinitely when size is zero (GHSA-2v37-7h3g-55p8, DoS)

## Target

All CVEs resolved

## Proposed Fix

```bash
cd client && npm audit fix
```

Dry run shows the fix is an in-range transitive bump:
- `nanoid 3.3.16 → 3.3.18`

NOT auto-applied because it is a CVE fix (p2 review item), even though in-range. Vite 8.2.0 → 8.2.1 patch did not resolve it (postcss still pins nanoid 3.3.16).

## Notes

- Created 2026-08-14 during weekly dep check
- The dompurify moderate XSS advisory (GHSA-55q2-fjhq-7xh7) from the same audit was resolved by the applied patch update to 3.4.13

## Acceptance Criteria

- [ ] `cd client && npm audit` reports 0 vulnerabilities
- [ ] Client builds (`npm run build:client` from project root)
