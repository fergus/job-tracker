# Upgrade vite 8.0.16 → 8.1.3 (minor bump)

**Priority:** p3 (minor bump, no CVEs)

## Problem

`vite` is outdated in the client/ package. This is a minor bump (8.0 → 8.1) within the same major version, expected to be safe but not a patch-level fix so not auto-applied.

## Current vs Latest

| Package | Current | Latest | Type |
|---------|---------|--------|------|
| `vite` (client) | 8.0.16 | 8.1.3 | minor |

## Proposed fix

```sh
cd client && npm install vite@8.1.3
```

## Acceptance criteria

- [ ] Install succeeds without errors
- [ ] `npm run test:unit` passes in client/
- [ ] Client build succeeds
- [ ] Application functions normally in dev mode

## Notes

Minor version bumps can introduce behavior changes — verify the dev server and build output before releasing.
