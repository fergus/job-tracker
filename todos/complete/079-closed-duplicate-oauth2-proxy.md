# Upgrade oauth2-proxy (Docker image) — CLOSED: duplicate of 074

**Priority:** p3 (patch bump, Docker image)

## Problem

`oauth2-proxy` image is pinned at v7.15.2. Latest is v7.15.3 (patch).

## Current vs Latest

| Image | Current | Latest | Type |
|-------|---------|--------|------|
| `quay.io/oauth2-proxy/oauth2-proxy` | v7.15.2 | v7.15.3 | patch |

## Proposed fix

Update `image:` line in `docker-compose.yml` to `quay.io/oauth2-proxy/oauth2-proxy:v7.15.3`, then deploy.

## Acceptance criteria

- [ ] Image tag updated in docker-compose.yml
- [ ] Docker pull works on docker.intervl.com
- [ ] oauth2-proxy container restarts healthy

## Notes

This is the auth proxy — update carefully and verify OIDC flow still works after deploy.
