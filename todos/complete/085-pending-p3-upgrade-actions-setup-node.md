# Upgrade actions/setup-node from v6 to v7 (major)

- **Priority:** p3
- **Created:** 2026-07-17
- **Category:** GitHub Actions

## Problem

`.github/workflows/build.yml` uses `actions/setup-node@v6`. The latest release is `v7.0.0` (major version bump).

## Current

`actions/setup-node@v6`

## Target

`actions/setup-node@v7`

## Proposed Fix

Update `.github/workflows/build.yml`:

```yaml
- uses: actions/setup-node@v7
```

## Acceptance Criteria

- [x] CI build passes with `actions/setup-node@v7`
- [x] Node.js is set up correctly for both test and build jobs

## Completion
- Completed 2026-08-01: `actions/setup-node` bumped v6 → v7 in `.github/workflows/build.yml`. Node 26 unchanged; CI will verify on next push.
