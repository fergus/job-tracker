# Upgrade axios (client)

**Priority:** p3 (minor bump, no CVEs)

## Problem

`axios` is at v1.17.0, latest is v1.18.0. This is a minor bump within v1.

## Current vs Latest

| Package | Current | Latest | Type |
|---------|---------|--------|------|
| `axios` (client) | 1.17.0 | 1.18.0 | minor |

## Proposed fix

```sh
cd client && npm install axios@1.18.0
```

## Acceptance criteria

- [ ] Install succeeds without errors
- [ ] `npm run test:unit` passes in client/
- [ ] All API calls in the app still work (list, create, update applications)

## Notes

Axios is the HTTP client for all Vue app API calls (`client/src/api.js`).
