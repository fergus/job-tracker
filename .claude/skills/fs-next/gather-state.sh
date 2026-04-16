#!/usr/bin/env bash
# fs-next: gather project state for prioritization
# Outputs structured sections for each area of interest.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

CACHE_DIR="$ROOT/.claude/skills/fs-next/.cache"
mkdir -p "$CACHE_DIR"
MAX_AGE=14400  # 4 hours in seconds

# Cache npm outdated output keyed to the package-lock.json hash.
# Falls back to a live npm call if the cache is missing, stale (>4h), or the
# lockfile has changed since the cache was written.
npm_outdated_cached() {
  local label="$1"   # "client" or "server"
  local dir="$2"     # path relative to ROOT

  local lockfile="$ROOT/$dir/package-lock.json"
  local hash=""

  if [[ -f "$lockfile" ]]; then
    hash=$(sha256sum "$lockfile" | cut -d' ' -f1)
  else
    hash="no-lockfile"
  fi

  local cache_file="$CACHE_DIR/npm-outdated-${label}-${hash}"

  # Check if a valid cache file exists and is within the TTL
  if [[ -f "$cache_file" ]]; then
    local now
    now=$(date +%s)
    local mtime
    mtime=$(stat -c %Y "$cache_file" 2>/dev/null || echo 0)
    local age=$(( now - mtime ))

    if (( age < MAX_AGE )); then
      cat "$cache_file"
      return
    fi
  fi

  # Clean up stale cache files for this label (different hash or expired)
  rm -f "$CACHE_DIR/npm-outdated-${label}-"* 2>/dev/null || true

  # Run live and cache the result
  local output
  output=$(cd "$ROOT/$dir" && npm outdated 2>/dev/null) || true
  echo "$output" > "$cache_file"
  echo "$output"
}

echo "=== PENDING TODOS ==="
ls todos/ | grep -- '-pending-' || echo "(none)"

echo ""
echo "=== IDEATION ==="
ls docs/ideation/ 2>/dev/null || echo "(none)"

echo ""
echo "=== BRAINSTORMS ==="
ls docs/brainstorms/ 2>/dev/null || echo "(none)"

echo ""
echo "=== PLANS ==="
ls docs/plans/ 2>/dev/null || echo "(none)"

echo ""
echo "=== SOURCE TODOS/FIXME/HACK ==="
grep -rn "TODO\|FIXME\|HACK" \
  --include="*.js" --include="*.vue" --include="*.mjs" \
  --exclude-dir=node_modules \
  client/src/ server/ || echo "(none)"

echo ""
echo "=== OUTDATED PACKAGES (client) ==="
npm_outdated_cached "client" "client"

echo ""
echo "=== OUTDATED PACKAGES (server) ==="
npm_outdated_cached "server" "server"

echo ""
echo "=== RECENT COMMITS ==="
git log --oneline -20 --format="%h %s (%ar)"
