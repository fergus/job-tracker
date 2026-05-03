---
status: pending
priority: p3
issue_id: "034"
tags: [dependencies]
dependencies: []
---

# Upgrade Node.js Docker base image from 24 to 25

## Problem Statement
The Dockerfile uses `node:24-alpine` (current LTS). Node.js 25 (the "current" non-LTS release, codename krypton) is now available. Node 25 is an odd-numbered release and will not become LTS; Node 26 (even, next LTS) is expected around October 2026. This todo tracks awareness of the newer version and schedules evaluation of when to move to Node 26 LTS once available.

## Findings
- Current version: node:24-alpine (Node 24.15 LTS)
- Latest available: node:25-alpine (Node 25.9, non-LTS/Current)
- Next LTS: node:26-alpine (expected ~October 2026)
- Upgrade type: Docker (major)
- Note: Node 25 is an odd-numbered, non-LTS release with a ~6-month support window. Upgrading to it for production is generally not recommended. The recommended path is to wait for Node 26 LTS.

## Proposed Solutions
### Option A: Upgrade to Node 26 LTS when available (~October 2026)
Update `FROM node:24-alpine` → `FROM node:26-alpine` in `Dockerfile` once Node 26 is released and available on Docker Hub.
- **Effort**: Small | **Risk**: Low (LTS-to-LTS upgrade)

### Option B: Upgrade to Node 25 now (not recommended)
Update `FROM node:24-alpine` → `FROM node:25-alpine`. Not recommended — Node 25 is non-LTS and near EOL.
- **Effort**: Small | **Risk**: Medium (non-LTS, limited support window)

## Acceptance Criteria
- [ ] Dockerfile updated to node:26-alpine (or newer LTS)
- [ ] Build passes with no regressions
- [ ] CI node-version in build.yml updated to match (currently pinned to '22')
