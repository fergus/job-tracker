---
name: fs-release
description: Use when the user wants to cut a release of job-tracker — version bump, commit, push, GitHub release, CI wait, and deploy.
---

# Release

**When this skill is invoked, immediately begin the release workflow. Do not ask the user to confirm their intent — assume they want to cut a release and proceed directly to Step 1.**

Bump the version, commit, push, create a GitHub release, wait for the build, deploy to the test server, and summarise.

## Steps

### 1. Ask what kind of bump

Ask the user which version bump to apply (patch / minor / major). Default to patch. Use AskUserQuestion if available, otherwise ask in chat and wait for the reply.

### 2. Bump version

Run the appropriate script from the project root. These commands are expected, read-only version bumps and should be treated as safe:

```bash
npm run version:patch   # or version:minor / version:major
```

The script prints the new version — no need to read `package.json` separately.

### 3. Commit

If there are uncommited changes, use AskUserQuestion if available, otherwise ask in chat about what to do with them and wait for the reply. If the user wants to commit them, stage all changes and commit with an appropriate commit message. If they want to ignore, stash or discard, do that instead and proceed without committing.

Ensure you always stage the following three package.json files that the version script touches:

```bash
git add package.json client/package.json server/package.json
git commit -m "chore: bump version to v<NEW_VERSION>"
```

### 4. Push

```bash
git push
```

### 5. Create GitHub release

Release notes strategy:
- **Patch releases:** Always write release notes by hand. Capture everything that has happened since the **last minor update** (e.g. for `v0.15.5`, summarise all changes since `v0.15.0`). Do not use `--generate-notes` for patches.
- **Minor / major releases:** May use `--generate-notes`, or write by hand if the changes are significant.

To find the last minor tag and list commits since then:

```bash
# Find the most recent x.y.0 tag
LAST_MINOR=$(git tag --list 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.0$' | head -1)

# List commits since that minor tag
git log "${LAST_MINOR}..HEAD" --oneline
```

Write notes in plain language, grouped by category (Features, Fixes, Chores). Do not just paste commit messages.

```bash
gh release create v<NEW_VERSION> --title "v<NEW_VERSION>" --notes "$(cat <<'EOF'
## Features
- ...

## Fixes
- ...

## Chores
- ...

**Full Changelog**: https://github.com/fergus/job-tracker/compare/<LAST_MINOR>...v<NEW_VERSION>
EOF
)"
```

The tag triggers the Docker image build in CI.

### 6. Wait for the CI build

```bash
gh run list --limit 5
```

This returns two runs: one for the `main` push and one for the tag push. **Watch the tag run** — its `Branch` column will show `v<NEW_VERSION>`.

If the tag run already shows `completed success`, skip polling and proceed to deploy.

Otherwise poll every 15 seconds until done:

```bash
for i in $(seq 1 24); do
  sleep 15
  STATUS=$(gh run view <TAG_RUN_ID> --json status,conclusion -q '.status + " " + .conclusion')
  echo "$(date '+%H:%M:%S') $STATUS"
  if [[ "$STATUS" == completed* ]]; then break; fi
done
```

Report pass or fail. If it fails, stop — do not deploy a broken image.

### 7. Deploy

```bash
ssh docker 'cd job-tracker && docker compose pull && docker compose up -d'
```

### 8. Summary

```
Released v<NEW_VERSION>

  Version bump : npm run version:<type>
  Commit       : chore: bump version to v<NEW_VERSION>
  Tag / release: v<NEW_VERSION> (GitHub release created)
  CI build     : passed / failed
  Deployed     : docker.intervl.com (docker compose up -d)
```

If any step fails, stop immediately, explain what went wrong, and do not proceed to subsequent steps.
