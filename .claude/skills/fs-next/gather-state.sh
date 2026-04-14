#!/usr/bin/env bash
# fs-next: gather project state for prioritization
# Outputs structured sections for each area of interest.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

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
(cd client && npm outdated 2>/dev/null) || true

echo ""
echo "=== OUTDATED PACKAGES (server) ==="
(cd server && npm outdated 2>/dev/null) || true

echo ""
echo "=== RECENT COMMITS ==="
git log --oneline -20 --format="%h %s (%ar)"
