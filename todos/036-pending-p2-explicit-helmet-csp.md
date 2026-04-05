---
status: pending
priority: p2
issue_id: "036"
tags: [security, owasp, csp, helmet]
dependencies: []
---

# Define an Explicit helmet Content-Security-Policy

## Problem Statement
`server/app.js` uses `helmet()` with default settings. The defaults are reasonable but fragile — any future dependency that requires `unsafe-inline` or a new external source will either silently break or require weakening an undocumented implicit policy.

## Findings
- **OWASP A05 — Security Misconfiguration:** Relying on helmet defaults means the CSP is not explicitly reviewed or documented. Future additions (fonts, analytics, CDN assets) may require CSP changes that aren't obvious without a written policy.
- The SPA uses marked + DOMPurify for markdown rendering (client-side), no inline scripts. The required CSP surface is small and well-defined.

## Proposed Solution
Replace `app.use(helmet())` in `server/app.js` with an explicit configuration:

```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Tailwind requires this
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
}))
```

Audit the actual SPA network requests to confirm all required sources are included before deploying.

## Acceptance Criteria
- [ ] Explicit CSP directives defined in `server/app.js`
- [ ] Tested in browser dev tools — no CSP violations on normal app usage
- [ ] `styleSrc` accounts for Tailwind's inline style requirements if needed

## Work Log
- 2026-03-25: Created from OWASP Top 10 security review
