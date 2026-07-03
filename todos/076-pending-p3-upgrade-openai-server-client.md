# Upgrade openai (server and client)

**Priority:** p3 (minor bump, no CVEs)

## Problem

`openai` is outdated in both server/ and client/ packages. This is a minor bump within the same major version so it should be safe, but it's not a patch-level fix.

## Current vs Latest

| Package | Current | Latest | Type |
|---------|---------|--------|------|
| `openai` (server) | 6.44.0 | 6.45.0 | minor |
| `openai` (client) | 6.44.0 | 6.45.0 | minor |

## Proposed fix

```sh
cd server && npm install openai@6.45.0
cd client && npm install openai@6.45.0
```

## Acceptance criteria

- [ ] Both installs succeed without errors
- [ ] `npm test` passes in server/
- [ ] `npm run test:unit` passes in client/
- [ ] Application functions normally (create/update applications)

## Notes

Version matches across both package.json files — keep them in sync.
