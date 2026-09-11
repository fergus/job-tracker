# Fix server CVEs (fast-uri high, qs moderate, @xmldom/xmldom moderate)

- **Priority:** p2
- **Created:** 2026-09-04
- **Category:** Security

## Problem

`npm audit` on `server/` reports 3 vulnerabilities:

| Package | Severity | Type | Fix |
|---------|----------|------|-----|
| `fast-uri` | **HIGH** | Transitive (via @modelcontextprotocol/sdk@1.30.0 → ajv@8.18.0) | Fixed in 3.1.6+ |
| `qs` | moderate | Transitive (via express@5.2.1 → body-parser@2.3.0; also supertest → superagent, dev) | Fixed in 6.16.0+ |
| `@xmldom/xmldom` | moderate | Transitive (via mammoth@1.12.2) | Fixed in 0.8.15+ |

All three report `fixAvailable: true`. Client audit is clean (0 vulnerabilities).

## Current

- `fast-uri@3.1.5` — 4 advisories: host confusion via skipped IDN canonicalization on scheme-relative references (GHSA-5jgf-p345-68v8), SSRF via malformed IPv6 normalization (GHSA-f65p-4m7j-42xc), SSRF via repeated hostname percent-decoding (GHSA-fph4-wmhf-6fwf), host confusion via percent-encoded scheme normalization (GHSA-jqff-g426-hqxp). All CVSS 7.5.
- `qs@6.15.2` — array-limit bypass via bracket-key comma parsing (GHSA-x5fp-wj9c-mxmx), DoS via attacker-controlled isBuffer (GHSA-4mjr-xmp4-gh2g)
- `@xmldom/xmldom@0.8.13` — XML fragment injection via invalid EntityReference.nodeName during requireWellFormed serialization (GHSA-6gmq-8vp8-gcm6)

## Target

All CVEs resolved

## Proposed Fix

1. Try `npm audit fix` first — all three report `fixAvailable: true`
2. fast-uri: if `npm audit fix` can't reach 3.1.6+ through ajv's range, add an npm `overrides` entry or upgrade `@modelcontextprotocol/sdk` when a version resolving fast-uri 3.1.6+ ships
3. qs: needs `express`/`body-parser` release pulling `qs@>=6.16.0` (express 5.2.1 → body-parser 2.3.0 → qs 6.15.2); dev-tree copy via supertest resolves when superagent's range allows
4. @xmldom/xmldom: needs `mammoth` release allowing 0.8.15+, or an override

## Notes

- fast-uri was previously fixed in the 086 run (SDK 1.30.0 brought 3.1.5); new advisories (2026-09) extend the vulnerable range to `<3.1.6` — same parent chain as before
- qs was previously fixed in run 035 (`035-complete-p2-qs-cve.md`); it recurs when express's body-parser pins an old qs
- Server tests must pass after the fix; MCP server (Streamable HTTP) should be smoke-tested since fast-uri sits in the MCP SDK tree

## Acceptance Criteria

- [x] `cd server && npm audit` reports 0 vulnerabilities
- [x] Server tests pass (`cd server && npm test`)
- [x] MCP tools still function (list/get/create application)

## Completion
- Completed 2026-09-08: all three advisories resolved by `npm update fast-uri qs @xmldom/xmldom` in `server/` — no `overrides` needed, since each fixed version sits inside its parent's existing range (`ajv` wants `fast-uri ^3.0.1`, `body-parser` wants `qs ^6.15.2`, `mammoth` wants `@xmldom/xmldom ^0.8.6`). Now on fast-uri 3.1.7, qs 6.16.0, @xmldom/xmldom 0.8.15; only `server/package-lock.json` changed.
- `cd server && npm audit` reports 0 vulnerabilities. Server tests: 345 pass, 0 fail.
- MCP smoke test against a throwaway DB on port 3999: initialize 200 with session id, tools/list returns 24 tools, `create_application` and `list_applications` both succeed, bad bearer key rejected with 401.
