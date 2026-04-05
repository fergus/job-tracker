---
status: complete
priority: p3
issue_id: "037"
tags: [dependencies]
dependencies: []
---

# Upgrade Node.js Docker base image from 22-alpine to 24-alpine

## Problem Statement
`Dockerfile` uses `node:22-alpine` for both build and runtime stages. Node.js 24 is
the current Active LTS release and brings runtime performance improvements, updated
V8, and a longer support window. Node 22 remains supported but upgrading to 24 aligns
with the current LTS recommendation.

## Findings
- Current version: node:22-alpine (both stages in Dockerfile)
- Latest LTS version: node:24-alpine
- Latest available: node:25-alpine (non-LTS / odd release — not recommended for production)
- Upgrade type: Docker major image

## Proposed Solutions
### Option A: Upgrade to node:24-alpine
Edit both `FROM` lines in `Dockerfile`:
```diff
-FROM node:22-alpine AS build
+FROM node:24-alpine AS build
 ...
-FROM node:22-alpine
+FROM node:24-alpine
```
Then run `docker compose build` and verify the app starts correctly.
- **Effort**: Small | **Risk**: Low-Medium (major Node version; test for any native addon compatibility, e.g. better-sqlite3)

## Acceptance Criteria
- [ ] Both `FROM` lines in `Dockerfile` updated to `node:24-alpine`
- [ ] `docker compose build` succeeds
- [ ] App starts and API tests pass inside the container
- [ ] `better-sqlite3` native bindings compile successfully on Node 24
