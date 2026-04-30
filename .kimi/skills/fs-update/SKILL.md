---
name: fs-update
description: Check all dependencies for updates, auto-apply safe patch-level npm upgrades, flag CVEs as high priority, prompt for decisions on minor/major/Docker/Actions changes, then commit and display a summary table.
---

# Dependency Update

Check all dependencies across the project, automatically apply safe patch-level npm upgrades, flag security vulnerabilities separately, prompt the user for decisions on anything riskier, then commit and display a summary table.

## Scope

This skill checks six categories:
1. **npm packages** — `server/` and `client/` (via `npm outdated`)
2. **npm security** — `npm audit` in both directories
3. **GitHub Actions** — versions pinned in `.github/workflows/*.yml`
4. **Docker images** — base image in `Dockerfile` and third-party images in `docker-compose.yml`
5. **Impeccable skill** — wherever it lives under `*/skills/impeccable/` (via GitHub raw check)
6. **Compound Engineering plugin** — latest release vs loaded version (informational; requires `gh`)

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

For the Impeccable skill, discover the local path first, then compare versions:

```bash
# Discover where the skill lives (could be .kimi/skills/ or .claude/skills/)
SKILL_MD=$(find /path/to/project -path "*/skills/impeccable/SKILL.md" -print -quit)
local_version=$(grep -E '^version:' "$SKILL_MD" 2>/dev/null | sed 's/version: //')
remote_version=$(curl -s https://raw.githubusercontent.com/pbakaus/impeccable/main/.claude/skills/impeccable/SKILL.md | grep -E '^version:' | sed 's/version: //')
```

For Compound Engineering, check the latest plugin release (informational only):

```bash
# Only works when gh is available; failure is silent
ce_latest=$(gh release list --repo EveryInc/compound-engineering-plugin --limit 5 --json tagName --jq '[.[] | select(.tagName | startswith("compound-engineering-v"))][0].tagName | sub("compound-engineering-v"; "")' 2>/dev/null || true)
```

### 2. Categorise findings

Build five lists:

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

For GitHub Actions, **only** flag an update when the pinned major version differs from the latest release's major version. For example, if the workflow uses `actions/checkout@v6` and the latest release is `v6.0.2`, skip it — the floating `@v6` tag already resolves to the latest patch. Only prompt when a new major is available (e.g. `@v6` → `v7.x.x`).

**E. Prompt items (Impeccable skill)**
If `remote_version` differs from `local_version`, present the update with:
- Current installed version and latest available version
- The discovered local path
- Options: **Update now**, **Create a todo**, **Skip**

For "Update now":
```bash
# Use the discovered local path, not a hardcoded one
SKILL_DIR=$(dirname "$SKILL_MD")
cd /tmp && rm -rf impeccable && git clone --depth 1 https://github.com/pbakaus/impeccable.git
# Copy from the remote .claude/skills layout into the local skills parent directory
LOCAL_SKILLS_PARENT=$(dirname "$SKILL_DIR")
cp -r /tmp/impeccable/.claude/skills/* "$LOCAL_SKILLS_PARENT/"
# Run cleanup from the updated local copy
node "$SKILL_DIR/scripts/cleanup-deprecated.mjs"
```
Then remove the `<post-update-cleanup>` section from `$SKILL_DIR/SKILL.md` if it exists.

**F. Informational (Compound Engineering plugin)**
If `ce_latest` was fetched successfully, compare it against the currently loaded plugin version (if determinable from skill paths or `ce-update` context). Surface it in the summary under "Plugins". No file changes are possible here — the update is applied via `claude plugin update`.

### 3. Handle npm dist-tags

When `npm outdated` reports `current > latest` (e.g. `4.1.0` vs `2.24.3`), the project may be tracking a non-default dist-tag. Run:

```bash
npm view <package> dist-tags --json
```

If the current version matches a known non-default tag (e.g. `next`, `beta`, `rc`), skip it with a note explaining which tag is being used. Do not treat it as a downgrade.

### 4. Auto-apply patch updates

For each package in list A:

Always use absolute paths to avoid working-directory drift between Bash calls:

```bash
cd /path/to/project/server && npm update <package>   # for server packages
cd /path/to/project/client && npm update <package>   # for client packages
```

Replace `/path/to/project` with the actual project root (the git repository root).

Track what was updated and the old → new versions for the summary.

### 5. Prompt for CVEs

If list B is non-empty, present each CVE group (there may be multiple per package) to the user one at a time using AskUserQuestion with options:

- **Fix now** — apply `npm audit fix` (or `npm audit fix --force` if a major bump is required, with a warning)
- **Create a todo** — create a file in `todos/` (see Todo Format below)
- **Skip** — note it in the summary and continue

For critical/high severity, lead with a clear warning.

### 6. Prompt for non-patch npm updates

If list C is non-empty, present them grouped (minor bumps together, major bumps together) using AskUserQuestion with options:

- **Update now** — run `npm install <package>@<version>`
- **Create a todo** — create a file in `todos/` (see Todo Format below)
- **Skip** — note in summary

### 7. Prompt for Docker/Actions updates

If list D is non-empty, present each item using AskUserQuestion with:
- The current version and latest available version
- Options: **Update now**, **Create a todo**, **Skip**

For "Update now":
- GitHub Actions: edit the `uses:` line in the workflow YAML
- Dockerfile `FROM`: edit the image tag
- `docker-compose.yml` `image:`: edit the image tag

### 8. Todo Format

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

### 9. Commit

Stage all modified files:

```bash
git add \
  server/package-lock.json \
  client/package.json client/package-lock.json \
  Dockerfile \
  docker-compose.yml \
  .github/workflows/*.yml \
  .kimi/skills/ .claude/skills/ \
  skills-lock.json \
  todos/
```

Only stage files that were actually changed. Commit with:

```bash
git commit -m "chore: dependency updates"
```

Do not include Co-Authored-By or any Claude attribution in the commit message.

If nothing changed (all items were skipped or todo'd), skip the commit and push, and say so.

After a successful commit, push to the remote:

```bash
git push -u origin HEAD:<current-branch>
```

If the repo is in a detached HEAD state, determine the target branch by checking
`git ls-remote origin` and push to `main` (or whichever branch HEAD was on before
the detach). Retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s) on
network failures.

### 10. Display summary table

Print a markdown table of all findings and their outcomes:

```markdown
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

### Skills
| Skill      | Current | Latest | Action       |
|------------|---------|--------|--------------|
| impeccable | 2.1.1   | 2.2.0  | Updated      |

### Plugins
| Plugin               | Current | Latest | Action                        |
|----------------------|---------|--------|-------------------------------|
| compound-engineering | v1.2.3  | v1.3.0 | Run `claude plugin update ...` |

### Notes
- List any caveats, skipped items, or things to be aware of
```

If there were no changes of a given type, omit that section.
