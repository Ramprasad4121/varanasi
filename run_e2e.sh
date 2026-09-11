#!/usr/bin/env bash
set -e

# ======================================================================
# Varanasi Product Integration — End-to-End Test Suite Wrapper
# ======================================================================
# Usage:
#   ./run_e2e.sh                   # Run all tiers
#   ./run_e2e.sh --tier 1          # Run Tier 1 (Feature Isolation)
#   ./run_e2e.sh --tier 2          # Run Tier 2 (Boundary & Corner Cases)
#   ./run_e2e.sh --tier 3          # Run Tier 3 (Cross-Feature Combinations)
#   ./run_e2e.sh --tier 4          # Run Tier 4 (Browser Scenarios)
#   ./run_e2e.sh --tier 2 -v       # Verbose output
#   ./run_e2e.sh --failfast        # Abort on first failure
# ======================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PYTHONPATH="${SCRIPT_DIR}:${PYTHONPATH}"

PYTHON_BIN=""
for candidate in \
  "/Library/Frameworks/Python.framework/Versions/3.10/bin/python3" \
  "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3" \
  "/opt/homebrew/bin/python3" \
  "/usr/local/bin/python3" \
  "/usr/bin/python3" \
  "$(which python3 2>/dev/null)"
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    PYTHON_BIN="$candidate"
    break
  fi
done

if [ -z "$PYTHON_BIN" ]; then
    echo "Error: Compatible python3 could not be found." >&2
    exit 1
fi

exec "$PYTHON_BIN" "${SCRIPT_DIR}/e2e/runner.py" "$@"
