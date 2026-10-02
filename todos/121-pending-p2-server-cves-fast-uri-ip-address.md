# Fix server CVEs — fast-uri (moderate) and ip-address (moderate)

- **Priority:** p2
- **Created:** 2026-10-03
- **Category:** Security (npm, server)

## Problem

`npm audit` on `server/` reports **2 moderate-severity vulnerabilities**, both
transitive. Neither is exploitable in a browser-facing path, but they are cheap
to fix and both sit on the MCP / rate-limit trees that handle untrusted input.

| Package | Severity | Type | Nodes | Fix |
|---------|----------|------|-------|-----|
| `fast-uri` | moderate | Transitive (`@modelcontextprotocol/sdk@1.30.1` → `ajv@8.18.0` → `fast-uri@3.1.7`) | 1 | `>=3.1.8` |
| `ip-address` | moderate | Transitive (`express-rate-limit@8.7.0` → `ip-address@10.5.0`) | 1 | `>=10.7.1` |

Client audit is clean (0 vulnerabilities).

## Current

- `fast-uri@3.1.7` — GHSA-hrr3-gc8f-f4qj, inconsistent host case normalization via
  percent-encoded octets (CVSS 4.8, `>=3.0.0 <3.1.8`)
- `ip-address@10.5.0` — four advisories, all moderate:
  - GHSA-rpw4-54j3-4h4q — `Address6.isLinkLocal()` recognizes `fe80::/64` not `fe80::/10` (SSRF)
  - GHSA-2vr4-cq9g-pvrc — no classifier for NAT64 local-use range `64:ff9b:1::/48` (SSRF)
  - GHSA-j6r3-76f7-8jcv — `isInSubnet()`/`isHostInSubnet()` compare mixed families (allowlist bypass)
  - GHSA-h3mg-xc3c-68pw — unbounded parse diagnostic for `Address6` (DoS)
  - vulnerable range: `<=10.7.0`

## Target

`npm audit` on `server/` reports 0 vulnerabilities.

## Proposed Fix

Both fixed versions sit **inside the parent's existing semver range**, so a plain
`npm update` resolves them — no `overrides` entry needed (same pattern as the now
completed `104-pending-p2-fix-server-cves.md`):

```bash
cd server && npm update fast-uri ip-address
```

Verified ranges:

- `ajv@8.18.0` / `8.20.0` both declare `fast-uri: ^3.0.1`; `3.1.8` is published.
- `express-rate-limit@8.7.0` declares `ip-address: ^10.2.0`; `10.7.3` is published.

Then `cd server && npm test` (486 tests) and a quick MCP smoke test, since
`fast-uri` sits in the MCP SDK's `ajv` tree.

## Acceptance Criteria

- [ ] `cd server && npm audit` reports 0 vulnerabilities
- [ ] `cd server && npm test` passes
- [ ] MCP tools still function (list/get application over the Streamable HTTP transport)
- [ ] Only `server/package-lock.json` changes

## Notes

- The `fast-uri` CVE recurs whenever `ajv`'s transitive pin lags a new advisory —
  see `086` and `104` runs. `ajv@8.20.0` does **not** widen the range (still
  `^3.0.1`), so the fix is `fast-uri@3.1.8` on the 3.x line, not 4.x.
- Both are transitive/dev-adjacent; not a deploy blocker, but a one-line fix.
