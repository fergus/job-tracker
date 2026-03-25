---
name: fs-update
description: Check all dependencies for updates, auto-apply safe patch-level npm upgrades, flag CVEs as high priority, prompt for decisions on minor/major/Docker/Actions changes, then commit and display a summary table.
---

# Dependency Update

Check all dependencies across the project, automatically apply safe patch-level npm upgrades, flag security vulnerabilities separately, prompt the user for decisions on anything riskier, then commit and display a summary table.

## Scope

This skill checks four categories:
1. **npm packages** — `server/` and `client/` (via `npm outdated`)
2. **npm security** — `npm audit` in both directories
3. **GitHub Actions** — versions pinned in `.github/workflows/*.yml`
4. **Docker images** — base image in `Dockerfile` and third-party images in `docker-compose.yml`

## Safe vs. Prompt

- **Auto-apply**: npm patch-level bumps only (Current and Wanted match, Latest differs only in patch segment)
- **Always prompt**: npm minor bumps, npm major bumps, GitHub Actions version bumps, Docker image bumps
- **CVEs**: Treated as higher priority — always surfaced separately with severity, even if the fix requires a major bump

## Steps

### 1. Gather all dependency information in parallel

Run all checks simultaneously:

```bash
# npm outdated (exit code 1 when outdated packages exist — that's normal)
cd server && npm outdated --json 2>/dev/null || true
cd client && npm outdated --json 2>/dev/null || true

# Security audits
cd server && npm audit --json 2>/dev/null || true
cd client && npm audit --json 2>/dev/null || true
```

For GitHub Actions, read all workflow files in `.github/workflows/` and extract `uses:` lines with their pinned versions.

For Docker images, read `Dockerfile` for `FROM` lines and `docker-compose.yml` for `image:` lines.

### 2. Categorise findings

Build four lists:

**A. Auto-apply (npm patch-only)**
A package qualifies if:
- The version difference is patch-only: e.g. `3.3.1` → `3.3.3` (same major.minor)
- It is NOT flagged by `npm audit` (CVEs are handled separately)

**B. CVEs (security vulnerabilities)**
From `npm audit --json`, extract each vulnerability: package name, severity (critical/high/moderate/low), affected range, and the fix version. Order by severity descending.

**C. Prompt items (non-patch npm)**
Minor and major npm version bumps that weren't auto-applied.

**D. Prompt items (Docker/Actions)**
GitHub Actions version bumps and Docker image version bumps. For each:
- Check the latest available version:
  - GitHub Actions: `gh api repos/<owner>/<repo>/releases/latest --jq '.tag_name'`
  - Docker Hub / Quay images: use the registry API or `curl` the tags endpoint
  - Node.js Docker image: check `https://hub.docker.com/v2/repositories/library/node/tags` filtering for `XX-alpine` tags

### 3. Auto-apply patch updates

For each package in list A:

```bash
cd server && npm update <package>   # for server packages
cd client && npm update <package>   # for client packages
```

Track what was updated and the old → new versions for the summary.

### 4. Prompt for CVEs

If list B is non-empty, present each CVE group (there may be multiple per package) to the user one at a time using AskUserQuestion with options:

- **Fix now** — apply `npm audit fix` (or `npm audit fix --force` if a major bump is required, with a warning)
- **Create a todo** — create a file in `todos/` (see Todo Format below)
- **Skip** — note it in the summary and continue

For critical/high severity, lead with a clear warning.

### 5. Prompt for non-patch npm updates

If list C is non-empty, present them grouped (minor bumps together, major bumps together) using AskUserQuestion with options:

- **Update now** — run `npm install <package>@<version>`
- **Create a todo** — create a file in `todos/` (see Todo Format below)
- **Skip** — note in summary

### 6. Prompt for Docker/Actions updates

If list D is non-empty, present each item using AskUserQuestion with:
- The current version and latest available version
- Options: **Update now**, **Create a todo**, **Skip**

For "Update now":
- GitHub Actions: edit the `uses:` line in the workflow YAML
- Dockerfile `FROM`: edit the image tag
- `docker-compose.yml` `image:`: edit the image tag

### 7. Todo Format

When creating a todo, write a markdown file to `todos/` following this exact naming convention and structure:

**Filename**: `<NNN>-pending-<priority>-<short-slug>.md`
- `NNN` — three-digit number, one higher than the current highest `issue_id` in the `todos/` directory
- `priority` — use `p2` for CVEs, `p3` for minor/major/Docker/Actions bumps
- `short-slug` — kebab-case description, e.g. `upgrade-vite-v8`

**Content**:
```markdown
---
status: pending
priority: p3
issue_id: "NNN"
tags: [dependencies]
dependencies: []
---

# <Title>

## Problem Statement
<Why this upgrade matters or what risk it carries>

## Findings
- Current version: X.Y.Z
- Latest version: A.B.C
- Upgrade type: major / minor / Docker / Actions

## Proposed Solutions
### Option A: Upgrade now
Run `npm install <package>@latest` (or equivalent), verify build passes, then release.
- **Effort**: Small | **Risk**: <Low/Medium/High>

## Acceptance Criteria
- [ ] Package upgraded to vA.B.C
- [ ] Build passes with no regressions
```

Use `tags: [dependencies, security]` for CVEs. Adjust the template as needed to capture relevant context (e.g. migration guide URL for major bumps, CVE identifier for security issues).

### 8. Commit

Stage all modified files:

```bash
git add \
  server/package-lock.json \
  client/package.json client/package-lock.json \
  Dockerfile \
  docker-compose.yml \
  .github/workflows/*.yml
```

Only stage files that were actually changed. Commit with:

```bash
git commit -m "chore: dependency updates"
```

Do not include Co-Authored-By or any Claude attribution in the commit message.

If nothing changed (all items were skipped or todo'd), skip the commit and say so.

### 8. Display summary table

Print a markdown table of all findings and their outcomes:

```
## Dependency Update Summary

### Auto-applied (patch)
| Package    | Location | Old     | New     |
|------------|----------|---------|---------|
| dompurify  | client   | 3.3.1   | 3.3.3   |

### Security (CVEs)
| Package | Severity | Fix     | Action       |
|---------|----------|---------|--------------|
| ...     | moderate | 3.3.3   | Fixed / Todo |

### Minor / Major npm
| Package | Location | Current | Latest | Action       |
|---------|----------|---------|--------|--------------|
| vite    | client   | 7.3.1   | 8.0.2  | Todo created |

### Docker / Actions
| Dependency       | Type    | Current | Latest  | Action       |
|------------------|---------|---------|---------|--------------|
| node alpine      | Docker  | 22      | 24      | Updated      |
| actions/checkout | Actions | v6      | v7      | Skipped      |

### Notes
- List any caveats, skipped items, or things to be aware of
```

If there were no changes of a given type, omit that section.
