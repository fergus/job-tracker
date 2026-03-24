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

Read the new version from `package.json`:

```bash
node -p "require('./package.json').version"
```

### 3. Commit

Stage only the three package.json files that the version script touches:

```bash
git add package.json client/package.json server/package.json
git commit -m "chore: bump version to v<NEW_VERSION>"
```

Do not include Co-Authored-By or any Claude attribution in the commit message.

### 4. Push

```bash
git push
```

### 5. Create GitHub release

Create an annotated release and tag in one step. The tag triggers the Docker image build in CI:

```bash
gh release create v<NEW_VERSION> --title "v<NEW_VERSION>" --generate-notes
```

### 6. Wait for the CI build

Get the run ID for the tag push and stream its progress:

```bash
gh run list --limit 5
```

Then watch it. Poll every 15 seconds with `gh run view <RUN_ID>` until the status is `completed`. Report pass or fail. If it fails, stop here and tell the user — do not deploy a broken image.

### 7. Deploy

Once the build passes, pull the new image and restart the container on the test server:

```bash
ssh docker 'cd job-tracker && docker compose pull && docker compose up -d'
```

### 8. Summary

Print a concise summary in this format:

```
Released v<NEW_VERSION>

  Version bump : npm run version:<type>
  Commit       : chore: bump version to v<NEW_VERSION>
  Tag / release: v<NEW_VERSION> (GitHub release created)
  CI build     : passed / failed
  Deployed     : docker.intervl.com (docker compose up -d)
```

If any step fails, stop immediately, explain what went wrong, and do not proceed to subsequent steps.
