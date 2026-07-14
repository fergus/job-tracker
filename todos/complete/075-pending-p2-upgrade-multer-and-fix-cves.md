# Upgrade multer and fix 3 high CVEs

**Priority:** p2 (fixes 3 high severity CVEs in server)

## Problem

- `multer` is at v2.1.1, latest is v2.2.0 (minor bump)
- This upgrade fixes 2 high CVEs:
  - GHSA-72gw-mp4g-v24j — Denial of Service via deeply nested field names
  - GHSA-3p4h-7m6x-2hcm — Denial of Service via incomplete cleanup of aborted uploads
- Also fixes transitive `form-data` CVE (GHSA-hmw2-7cc7-3qxx — high severity CRLF injection) across server + client

## Current vs Latest

| Package | Current | Latest | Type |
|---------|---------|--------|------|
| `multer` (server) | 2.1.1 | 2.2.0 | minor |
| `form-data` (transitive, server+client) | 4.0.5 | 4.0.6 | patch (but transitive) |

## Proposed fix

```sh
cd server && npm install multer@2.2.0
cd client && npm install  # to update form-data in lockfile
```

## Acceptance criteria

- [ ] `npm test` passes in server/
- [ ] `npm run test:unit` passes in client/
- [ ] No high severity CVEs remain in `npm audit` for server/
- [ ] No high severity CVEs remain in `npm audit` for client/

## Notes

The `form-data` CVE is transitive via openai and axios. Upgrading openai and axios will also help ensure form-data is patched. See todos for those separately.
