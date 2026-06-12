# sharp 0.34.5 → 0.35.1 (minor bump)

**Status:** pending
**Priority:** p3
**Created:** 2026-06-12

## Problem

`sharp` in `client/` is at `0.34.5`; latest is `0.35.1`. This is a minor version bump (0.34 → 0.35).

## Current vs Latest

- Current: `0.34.5`
- Latest: `0.35.1`

## Proposed Fix

Review the sharp changelog for breaking changes. Sharp is a native module used for icon generation (`generate-icons.js`) — test that icon generation still works after upgrade.

```bash
cd client && npm install sharp@0.35.1
cd client && node generate-icons.js  # verify icons generate cleanly
```

## Acceptance Criteria

- [ ] sharp changelog reviewed
- [ ] `generate-icons.js` runs without errors
- [ ] Generated icons look correct
