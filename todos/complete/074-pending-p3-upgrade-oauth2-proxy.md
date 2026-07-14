# oauth2-proxy v7.15.2 → v7.15.3 (Docker image)

**Status:** pending
**Priority:** p3
**Created:** 2026-06-12

## Problem

`oauth2-proxy` in `docker-compose.yml` is pinned to `v7.15.2`. The latest release is `v7.15.3`.

## Current vs Latest

- Current: `quay.io/oauth2-proxy/oauth2-proxy:v7.15.2`
- Latest: `quay.io/oauth2-proxy/oauth2-proxy:v7.15.3`

## Proposed Fix

Update the image tag in `docker-compose.yml` and redeploy. This is a patch release — review the release notes for any behaviour changes that might affect the PocketID OIDC flow.

```bash
# In docker-compose.yml:
#   image: quay.io/oauth2-proxy/oauth2-proxy:v7.15.3
```

## Acceptance Criteria

- [ ] oauth2-proxy v7.15.3 release notes reviewed
- [ ] Image tag updated in docker-compose.yml
- [ ] `docker compose pull oauth2-proxy` succeeds
- [ ] `docker compose up -d oauth2-proxy` — container healthy
- [ ] Auth flow tested (login via PocketID still works)
