# Update oauth2-proxy v7.15.4 → v7.15.5 (docker-compose service image)

- **Priority:** p3
- **Created:** 2026-10-03
- **Category:** Docker image (docker-compose.yml)

## Problem

`docker-compose.yml` pins the auth proxy at an exact tag:

```yaml
image: quay.io/oauth2-proxy/oauth2-proxy:v7.15.4
```

GitHub releases for `oauth2-proxy/oauth2-proxy` show the latest tag is **v7.15.5**
(patch release on the same 7.15 line). The weekly check does not auto-apply
service-image changes.

## Current

- Pinned: `v7.15.4`
- Latest: `v7.15.5`

## Proposed Fix

Bump the tag in `docker-compose.yml` and re-deploy:

```yaml
image: quay.io/oauth2-proxy/oauth2-proxy:v7.15.5
```

```bash
ssh docker 'cd job-tracker && docker compose pull && docker compose up -d oauth2-proxy'
```

Note: this container is **not** managed by the standard job-tracker deploy
(`--no-deps` skips it), so it needs its own pull/recreate.

## Acceptance Criteria

- [ ] `docker-compose.yml` pins `v7.15.5`
- [ ] `docker compose ps` shows `oauth2-proxy` running and healthy
- [ ] Login through the proxy still works end to end
