---
status: pending
priority: p2
issue_id: "035"
tags: [security, owasp, auth, oauth2-proxy]
dependencies: []
---

# Restrict OAUTH2_PROXY_EMAIL_DOMAINS from Wildcard

## Problem Statement
`docker-compose.yml` sets `OAUTH2_PROXY_EMAIL_DOMAINS=*`, which accepts users from any email domain. This is only safe because the OIDC provider (PocketID) is a private self-hosted instance. If the OIDC issuer URL is ever pointed at a public provider (Google, GitHub, etc.), anyone with an account could sign in.

## Findings
- **OWASP A04 — Insecure Design:** The wildcard domain setting creates a latent configuration risk. A single change to the OIDC issuer without updating the email domain allowlist would open the application to all users of that provider.
- No documentation warns operators about this constraint.

## Proposed Solution
Two acceptable approaches:

### Option A: Lock to specific domain (Preferred)
Change `OAUTH2_PROXY_EMAIL_DOMAINS=*` to the organization's actual email domain (e.g. `example.com`) in `docker-compose.yml` and `.env.example`.

### Option B: Keep wildcard, add prominent warning
If multiple domains need to be supported, keep `*` but add a comment block in both `docker-compose.yml` and `.env.example` making the assumption explicit:
```yaml
# WARNING: OAUTH2_PROXY_EMAIL_DOMAINS=* is ONLY safe with a private OIDC provider
# (e.g. self-hosted PocketID). Do NOT use with public providers like Google or GitHub —
# doing so would allow any user with an account on that provider to sign in.
```

## Acceptance Criteria
- [ ] `OAUTH2_PROXY_EMAIL_DOMAINS` is either restricted to a specific domain, or has a prominent warning comment
- [ ] `.env.example` updated with the same warning/restriction
- [ ] CLAUDE.md updated to document the assumption if wildcard is kept

## Work Log
- 2026-03-25: Created from OWASP Top 10 security review
