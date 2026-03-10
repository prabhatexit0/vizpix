#!/bin/bash
# Chain multiple Ralph PRD runs back-to-back.
# Usage: ./chain-runs.sh
# Runs slider-ux after current run finishes, then mobile-support.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

unset CLAUDECODE

echo "=== CHAIN RUNNER: Waiting for current Ralph run to finish ==="

# Wait for any running claude --print process to finish
while pgrep -f "claude.*--dangerously-skip-permissions.*--print" > /dev/null 2>&1; do
  sleep 30
done

echo "=== Current run finished. Starting slider-ux run ==="
sleep 5

# --- Run 2: Slider UX ---
cp "$SCRIPT_DIR/prd-slider-ux.json" "$SCRIPT_DIR/prd.json"
git checkout -b ralph/slider-ux 2>/dev/null || git checkout ralph/slider-ux
git add "$SCRIPT_DIR/prd.json" && git commit -m "swap in slider-ux PRD for Ralph run" || true

"$SCRIPT_DIR/ralph.sh" --tool claude 12

echo "=== Slider UX run finished. Starting mobile-support run ==="
sleep 5

# --- Run 3: Mobile Support ---
cp "$SCRIPT_DIR/prd-mobile.json" "$SCRIPT_DIR/prd.json"
git checkout -b ralph/mobile-support 2>/dev/null || git checkout ralph/mobile-support
git add "$SCRIPT_DIR/prd.json" && git commit -m "swap in mobile-support PRD for Ralph run" || true

"$SCRIPT_DIR/ralph.sh" --tool claude 12

echo ""
echo "=== ALL CHAIN RUNS COMPLETE ==="
echo "Branches created:"
echo "  ralph/slider-ux"
echo "  ralph/mobile-support"
echo ""
echo "Check scripts/ralph/REVIEW.md for assumptions to review."
