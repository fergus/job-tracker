---
status: pending
priority: p2
issue_id: "043"
tags: [dependencies, security]
dependencies: []
---

# Upgrade oauth2-proxy from v7.15.1 to v7.15.2 (Docker — security critical)

## Problem Statement
`oauth2-proxy` in `docker-compose.yml` is pinned at v7.15.1. Version v7.15.2, released
2026-04-14, includes critical security fixes: **authentication bypass** and **session
fixation** vulnerabilities, plus a Golang upgrade. This is the authentication layer
in front of the entire application and must be updated promptly.

## Findings
- Current version: v7.15.1 (`docker-compose.yml`)
- Latest version: v7.15.2
- Upgrade type: Docker image (patch, security critical)
- CVEs fixed: authentication bypass, session fixation (see release notes)
- Release notes: https://github.com/oauth2-proxy/oauth2-proxy/releases/tag/v7.15.2

## Proposed Solutions
### Option A: Upgrade now
Edit `docker-compose.yml`, changing the `image:` line:
```
image: quay.io/oauth2-proxy/oauth2-proxy:v7.15.2
```
Then redeploy with `docker compose pull && docker compose up -d`.
The patch bump is backwards compatible; no config changes expected.
- **Effort**: Small | **Risk**: Low (patch bump; rollback by reverting image tag)

## Acceptance Criteria
- [ ] `docker-compose.yml` updated to `quay.io/oauth2-proxy/oauth2-proxy:v7.15.2`
- [ ] Container pulled and redeployed
- [ ] OIDC login flow confirmed working end-to-end
- [ ] No regressions in authenticated routes

## Work Log
- 2026-04-19: Surfaced by weekly dependency update scan; v7.15.2 released 2026-04-14 with critical security fixes (auth bypass, session fixation)
