# Upgrade actions/checkout to v7 (GitHub Actions)

**Priority:** p3 (major bump, CI pipeline)

## Problem

The CI workflow uses `actions/checkout@v6`. Latest version is v7.0.0 (major bump).

## Current vs Latest

| Action | Current | Latest | Type |
|--------|---------|--------|------|
| `actions/checkout` | v6 | v7.0.0 | major |

## Proposed fix

Update `.github/workflows/build.yml`:
```yaml
- uses: actions/checkout@v7
```

## Acceptance criteria

- [ ] CI workflow runs without errors
- [ ] All tests pass on CI
- [ ] Docker build succeeds

## Notes

Check CHANGELOG for breaking changes before upgrading. actions/checkout v7 likely requires Node 20+, which our CI runner should already have.
