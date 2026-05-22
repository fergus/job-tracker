# Pending: Upgrade helmet 8.1.0 → 8.2.0 (minor)
**Created:** 2026-05-22
**Priority:** P3 (minor bump, routine)
**Status:** pending
**Module:** server

## What
`helmet` has a minor update available: `8.1.0` → `8.2.0`.

## Action
Review the [helmet changelog](https://github.com/helmetjs/helmet/releases) for any breaking changes or CSP modifications, then run:
```bash
cd server && npm install helmet@8.2.0
```

Verify the CSP configuration in `server/app.js` still works after update. Test with `npm test`.
