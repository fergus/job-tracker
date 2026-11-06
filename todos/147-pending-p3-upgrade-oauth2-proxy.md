# Bump `oauth2-proxy` image v7.15.5 → v7.15.6

- **Priority:** p3
- **Created:** 2026-11-06
- **Category:** Maintenance (Docker image, auth)

## Problem

`docker-compose.yml` pins the auth front end:

```yaml
image: quay.io/oauth2-proxy/oauth2-proxy:v7.15.5
```

Upstream latest is **v7.15.6**. A patch release, but the dependency job never
auto-applies Docker image changes — the image is the only thing standing between
the internet and the app, and a bad tag means nobody can log in, so it is
reviewed and deployed deliberately.

## Current

- `quay.io/oauth2-proxy/oauth2-proxy`: **v7.15.5** (pinned in `docker-compose.yml`)
- Latest: **v7.15.6**
- `ghcr.io/fergus/job-tracker:latest` is the app's own image — not a dependency
  bump, ignore it here.
- The build image (`node:26-alpine` in `Dockerfile`) is current: Node 26 is the
  active line and no 28 tags exist yet. Nothing to do there.

## Proposed Solution

1. Read the v7.15.6 release notes for behaviour changes to session cookie
   handling, provider defaults or `--skip-auth-route` matching. The skip-auth
   pattern in this deployment is load-bearing: `docker-compose.yml` adds
   `carddav(/.*)?` and `\.well-known/carddav` to the end-anchored
   `OAUTH2_PROXY_SKIP_AUTH_ROUTES`, and a test asserts that pattern against
   sample paths. If the release changes pattern semantics, that test should fail
   — read the failure before touching the pattern.
2. Edit the tag in `docker-compose.yml`, commit, and cut a normal patch release
   so the change ships through the documented deploy path.
3. Deploy with the explicit production files:

```bash
ssh docker 'cd job-tracker && git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml pull'
ssh docker 'cd job-tracker && docker compose up -d --force-recreate oauth2-proxy'
ssh docker 'cd job-tracker && docker compose ps'
```

4. Verify a real login through the browser (PocketID OIDC round trip) and that
   `/carddav/` still returns its Basic challenge rather than a redirect to the
   OIDC provider.

## Acceptance Criteria

- [ ] `docker-compose.yml` pins `v7.15.6`
- [ ] `docker compose ps` shows oauth2-proxy healthy on the new tag
- [ ] Browser OIDC login succeeds end to end
- [ ] `curl -i https://<domain>/carddav/` returns `401` with a `WWW-Authenticate: Basic` challenge (not a 302 to the provider)
- [ ] A `scope = 'contacts'` API key still reads the address book on an iPhone

- **Effort**: Small | **Risk**: Low–Medium (auth front end; failure mode is total login loss, verified by a real login before closing)
