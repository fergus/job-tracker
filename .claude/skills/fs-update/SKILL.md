---
name: fs-update
description: Check all dependencies for updates, surface everything for human review with safety metadata, apply approved changes in one batch, then commit and display a summary table. No automatic application of any dependency change.
---

# Dependency Update

Last reviewed: 2026-09-28 on Claude Opus 5.5.

Check all dependencies across the project, surface every finding for human review with safety metadata, then apply approved changes in a single batch. **No update is applied without explicit approval.**

## Safety Principle

npm has suffered multiple supply-chain compromises in patch-level releases of well-known packages (colors, faker, rc, ua-parser-js, @types/estree, and others). Even a patch bump from 3.3.1 to 3.3.2 can introduce malicious code. **This skill therefore never auto-applies any npm update.** Every change is presented for review first.

**No npm output is ever piped through Python or any external parsing script.** The agent reads npm's JSON output directly.

## Scope

This skill checks five categories:
1. **npm packages** — `server/` and `client/` (via `npm outdated --json`)
2. **npm security** — `npm audit --json` in both directories
3. **GitHub Actions** — versions pinned in `.github/workflows/*.yml`
4. **Docker images** — base image in `Dockerfile` and third-party images in `docker-compose.yml`
5. **Impeccable plugin** — installed via the plugin marketplace (via GitHub raw check)

## Steps

### 0. Prepare

Findings are only as good as the checkout they come from.

```bash
date +%F                                   # use this date everywhere; never guess it
git fetch origin && git status -sb         # confirm you are on current main, not a stale or detached checkout
(cd server && npm ci) && (cd client && npm ci)
```

`npm outdated` reports every package as `MISSING` without `node_modules`, and
`npm audit` is less reliable, so install first. Run each npm command from its
own directory with an explicit `cd <root>/server` or `cd <root>/client` in the
same call; a bare `npm outdated` runs wherever the shell last was.

Then list the open dependency todos (see `.claude/skills/fs-todos/SKILL.md`)
and note each one's age, so step 2 can match findings against them.

### 1. Gather all dependency information

Run all checks. `npm outdated` exits 1 when outdated packages exist — that's expected.

```bash
# npm outdated
cd server && npm outdated --json 2>/dev/null; true
cd client && npm outdated --json 2>/dev/null; true

# Security audits
cd server && npm audit --json 2>/dev/null; true
cd client && npm audit --json 2>/dev/null; true
```

For GitHub Actions, read all workflow files in `.github/workflows/` and extract `uses:` lines with their pinned versions. Look up the latest release with `gh api repos/<owner>/<repo>/releases/latest --jq .tag_name` rather than scraping release pages. Most pins are floating major tags (`@v6`), which already track the newest 6.x, so only a new *major* is an update.

For Docker images, read `Dockerfile` for `FROM` lines and `docker-compose.yml` for `image:` lines.

For the Impeccable plugin (managed by Claude Code, not vendored in this repo), report the installed version against the latest on GitHub:
```bash
local_version=$(grep -A4 '"impeccable@impeccable"' ~/.claude/plugins/installed_plugins.json | grep -m1 '"version"' | sed 's/.*: "\(.*\)".*/\1/')
remote_version=$(curl -s https://raw.githubusercontent.com/pbakaus/impeccable/main/.claude/skills/impeccable/SKILL.md | grep -E '^version:' | sed 's/version: //')
```

The marketplace auto-updates the plugin, so a gap is normally transient. Report it; do not clone or copy anything into the repo.

**The agent reads all npm JSON output directly. Do not pipe npm output to Python, jq, or any external script for parsing.**

### 2. Categorise and annotate findings

Build **one unified list** of all findings. For each npm package, annotate with safety metadata:

| Metadata field | How to determine |
|---|---|
| **Package name** | From `npm outdated --json` key |
| **Location** | `server` or `client` |
| **Current version** | From `npm outdated --json` |
| **Latest version** | From `npm outdated --json` |
| **Version change** | patch / minor / major (compare semver segments) |
| **CVE?** | Yes if the package appears in `npm audit --json` output |
| **CVE severity** | critical / high / moderate / low (from audit, if applicable) |
| **Direct or transitive?** | Check `package.json` in the relevant directory — if the package is listed in `dependencies` or `devDependencies`, it's direct; otherwise transitive |
| **Publisher verified?** | `npm view <package> --json` and check `signingKeys` or `provenance` fields. Note: this is advisory — many legitimate packages lack provenance |
| **Update age** | `npm view <package>@<latest> time --json` — if the latest version was published less than 48 hours ago, flag as "fresh" (higher risk of undetected compromise) |
| **Blast radius** | `npm why <package>` in the relevant directory to see how many packages depend on it |

**Match against existing todos.** For each finding, check whether an open todo already covers that package or advisory.

- Same target version: do not create a duplicate. Report the todo and its age.
- Target moved (a newer latest): add an `- **Updated:**` line to the todo, per fs-todos.
- Finding gone (already fixed, or the package was removed): move the todo to `todos/complete/` and rename its marker, per fs-todos.
- A CVE todo older than two weeks is stale: raise it in the summary as overdue instead of re-listing it quietly.

### 3. Present all findings in a consolidated summary

Display a single markdown table containing ALL findings, grouped by category. Include the safety metadata for npm packages.

```markdown
## Dependency Update Summary

### Security Vulnerabilities (CVEs) — FIX REQUIRED
| Package | Location | Current | Fix Version | Severity | Direct? | Update Age | Action |
|---------|----------|---------|-------------|----------|---------|------------|--------|
| semver  | server   | 7.5.0   | 7.7.1       | high     | transitive | 3 days    | Will fix |

### npm Package Updates
| Package | Location | Current | Latest | Change | CVE? | Direct? | Publisher Verified? | Update Age |
|---------|----------|---------|--------|--------|------|---------|--------------------|------------|
| vite    | client   | 7.3.1   | 8.0.2  | major  | No   | direct  | Yes                | 12 days    |
| axios   | client   | 1.11.0  | 1.11.1 | patch  | No   | direct  | No                 | 6 hours ⚠️ |

### Docker / GitHub Actions
| Dependency       | Type    | Current | Latest | Notes |
|------------------|---------|---------|--------|-------|
| node alpine      | Docker  | 22      | 24     | node:24-alpine available |
| actions/checkout | Actions | v6      | v7     |       |

### Skills
| Skill      | Current | Latest | Notes |
|------------|---------|--------|-------|
| impeccable | 2.1.1   | 2.2.0  |       |
```

For fresh updates (<48h old), add the ⚠️ marker and a brief warning below the table.

**If any CVEs are found**, they are non-negotiable — present them with a clear note that they will be fixed.

### 4. Single approval prompt

**Unattended runs (scheduled, no one to answer).** Do not apply anything, and do not skip anything silently. Treat the answer as "Skip all": step 6 creates or updates a todo for every finding (CVEs as p2 and called out at the top of the summary), including ones that fall under a CVE-only fix. If the invoking prompt asks for patch bumps to be auto-applied, this skill's no-auto-apply policy wins; record them as todos and say so in the summary.

Using `AskUserQuestion`, present a single question:

> "Apply all proposed updates? CVEs will be fixed regardless. Patch/minor/major updates, Docker images, Actions versions, and skills are optional. Choose:"

Options:
1. **Apply everything** — fix CVEs + apply all npm/Docker/Actions/skill updates
2. **CVEs only** — fix only security vulnerabilities, skip the rest
3. **Choose manually** — I want to pick which updates to apply
4. **Skip all** — don't apply anything, just record findings as todos

If the user chooses "Choose manually", present each non-CVE category group as a follow-up question with the same four options scoped to that group.

Do NOT prompt per-package. One approval covers the batch.

### 5. Apply approved changes

Only apply changes the user explicitly approved.

For npm packages (CVEs and user-approved updates):

```bash
cd /path/to/project/server && npm install <package>@<version>   # for server packages
cd /path/to/project/client && npm install <package>@<version>   # for client packages
```

Replace `/path/to/project` with the actual git repository root.

For GitHub Actions version bumps, edit the `uses:` line in the workflow YAML.

For Docker image bumps, edit the `FROM` line in `Dockerfile` or the `image:` line in `docker-compose.yml`.

The Impeccable plugin is never applied from this skill. If it is behind, tell the user to run `/plugin` and update `impeccable@impeccable`; record it as a todo only if they decline.

Track everything that was applied for the final summary.

### 6. Create todos for skipped items

For any finding the user chose to skip (and not already covered by an open todo, per step 2), create a todo. Read
`.claude/skills/fs-todos/SKILL.md` for the naming, numbering, priority and file
layout, then fill the body with the dependency detail:

```markdown
# Upgrade <package> <current> to <latest> (<major|minor|patch|Docker|Actions>, <client|server|both>)

- **Priority:** <p2 for CVEs, p3 otherwise>
- **Created:** YYYY-MM-DD
- **Category:** npm dependency (<client|server|both>)

## Problem
<Why this upgrade matters or what risk it carries. Name the CVE if there is one.>

## Current
- Current version: X.Y.Z
- Latest version: A.B.C
- Safety: <publisher verified? / update age at time of check>

## Proposed Solutions
### Option A: Upgrade now
Run `npm install <package>@latest` (or equivalent), verify build passes, then release.
- **Effort**: Small | **Risk**: <Low/Medium/High>

## Acceptance Criteria
- [ ] Package upgraded to vA.B.C
- [ ] Build passes with no regressions
```

### 7. Commit

Stage all files that were actually changed:

```bash
git add \
  server/package.json server/package-lock.json \
  client/package.json client/package-lock.json \
  Dockerfile \
  docker-compose.yml \
  .github/workflows/*.yml \
  todos/
```

Only stage files that were modified. Commit with:

```bash
git commit -m "chore: dependency updates"
```

Do not include Co-Authored-By or any AI attribution in the commit message.

If nothing changed (everything skipped), skip the commit and push, and say so.

After a successful commit, push to the remote:

```bash
git push -u origin HEAD:<current-branch>
```

If the repo is in a detached HEAD state, determine the target branch via `git ls-remote origin` and push to `main` (or whichever branch HEAD was on before detach). Retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s) on network failures.

### 8. Display final summary

Print a markdown table of what was actually applied and what was recorded as todos. End with every open dependency todo and its age in days, so long-standing items stay visible:

```markdown
## Dependency Update — Applied

### Security (CVEs fixed)
| Package | Location | Old → New | Severity |
|---------|----------|-----------|----------|
| semver  | server   | 7.5.0 → 7.7.1 | high |

### npm updates applied
| Package | Location | Old → New | Change |
|---------|----------|-----------|--------|
| axios   | client   | 1.11.0 → 1.11.1 | patch |

### Docker / Actions applied
| Dependency | Old → New |
|------------|-----------|
| ...        | ...       |

### Skills updated
| Skill      | Old → New |
|------------|-----------|
| ...        | ...       |

### Recorded as todos
| Item | Priority | Todo file |
|------|----------|-----------|
| ...  | p2       | todos/NNN-... |

### Skipped
| Item | Reason |
|------|--------|
| ...  | User chose to skip |

### Open dependency todos
| Todo | Priority | Age (days) |
|------|----------|------------|
| todos/NNN-... | p2 | 12 |
```

## Guardrails

- **Never auto-apply any npm update**, even patch-level. Supply-chain attacks often ship in patch bumps.
- **Never pipe npm output through Python or external scripts** for parsing. The agent reads JSON directly.
- Present all findings in one table; prompt once for batch approval.
- Fresh updates (<48h old) are flagged with ⚠️ and a warning.
- CVEs are non-negotiable — they will be fixed. The user can only choose how (now vs. record as todo).
- If `npm outdated` or `npm audit` fail (network issues, etc.), report what was found and move on — don't block.
- Never state a date, version or todo age you did not read from `date`, a registry or a file. Verify the checkout is current before calling anything "stale" or "unchanged".
- Do not fabricate version information. If you can't verify a version or safety property, note it as "unknown".
