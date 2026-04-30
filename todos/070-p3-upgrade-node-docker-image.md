---
status: pending
priority: p3
issue_id: "070"
tags: [dependencies]
dependencies: []
---

# Upgrade Node.js Docker image from 24-alpine to 25-alpine

## Problem Statement
Node.js 25 is available as an Alpine image. Upgrading keeps the runtime current and ensures access to the latest V8 and security patches.

## Findings
- Current version: node:24-alpine
- Latest version: node:25-alpine
- Upgrade type: Docker (major Node version)
- Location: Dockerfile (two `FROM` lines)

## Proposed Solutions
### Option A: Upgrade now
Update both `FROM` lines in the Dockerfile to `node:25-alpine`, rebuild the image, run the test suite, and verify the application starts correctly.
- **Effort**: Small | **Risk**: Low–Medium (Node 25 may introduce deprecation warnings or behavior changes)

## Acceptance Criteria
- [ ] Dockerfile uses `node:25-alpine`
- [ ] Docker image builds successfully
- [ ] Application starts and passes tests
