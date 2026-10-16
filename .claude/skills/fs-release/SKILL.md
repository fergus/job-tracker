---
name: fs-release
description: Use when the user wants to cut a release of job-tracker — version bump, commit, push, GitHub release, CI wait, and deploy.
---

# Release

Bump the version, commit, push, create a GitHub release, wait for the build, deploy to the test server, and summarise.

## Steps

### 1. Ask what kind of bump

Ask the user which version bump to apply (patch / minor / major). Default to patch. Use AskUserQuestion if available, otherwise ask in chat and wait for the reply.

### 2. Bump version

Run the appropriate script from the project root:

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
- If this is a routine patch (one or two small fixes), use `--generate-notes`
- If this release spans notable changes or multiple versions' worth of work, write release notes by hand — summarise features, fixes, and behaviour changes in plain language (not just commit messages)

```bash
# Routine patch:
gh release create v<NEW_VERSION> --title "v<NEW_VERSION>" --generate-notes

# Significant release:
gh release create v<NEW_VERSION> --title "v<NEW_VERSION>" --notes "$(cat <<'EOF'
<hand-written notes here>
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

Take a database backup first. A release that changes how rows are written is
not safe to roll back by redeploying the previous image; restoring this file
is the rollback.

```bash
ssh docker 'docker exec -u nodejs -w /app/server job-tracker-app node -e "require(\"better-sqlite3\")(\"/app/data/job-tracker.db\").backup(\"/app/data/pre-deploy-$(date +%Y%m%d-%H%M).db\").then(() => console.log(\"backup ok\"))"'
```

Stop if it does not print `backup ok`. Then deploy:

```bash
ssh docker 'cd job-tracker && git pull --ff-only && docker compose pull && docker compose up -d --build'
```

The host builds the app image from its own checkout (`build: .` in
`docker-compose.yml`), so `compose pull` alone deploys nothing: it only fetches
third-party images, and `up -d` then rebuilds from whatever the checkout holds.
The `git pull` and `--build` are what ship the release.

Verify the running version matches the release before reporting success:

```bash
ssh docker 'docker exec job-tracker-app grep -m1 "\"version\"" /app/server/package.json'
```

If it still shows the previous version, the deploy did not take; stop and say so.

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
