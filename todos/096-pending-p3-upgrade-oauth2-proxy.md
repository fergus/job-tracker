# Upgrade oauth2-proxy v7.15.3 → v7.15.4

- **Priority:** p3
- **Created:** 2026-08-21
- **Category:** Docker image (docker-compose.yml)

## Problem

`docker-compose.yml` pins `quay.io/oauth2-proxy/oauth2-proxy:v7.15.3` exactly. Latest upstream release is `v7.15.4` (patch-level fix). Docker image changes are not auto-applied by the weekly dependency check.

## Current

`quay.io/oauth2-proxy/oauth2-proxy:v7.15.3`

## Target

`quay.io/oauth2-proxy/oauth2-proxy:v7.15.4`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker && sed -i 's/oauth2-proxy:v7.15.3/oauth2-proxy:v7.15.4/' docker-compose.yml
ssh docker 'cd job-tracker && docker compose pull oauth2-proxy && docker compose up -d oauth2-proxy'
```

## Acceptance Criteria

- [ ] `docker-compose.yml` references `v7.15.4`
- [ ] oauth2-proxy container restarted and healthy (`docker compose ps` on docker.intervl.com)
- [ ] Login flow through oauth2-proxy still works
