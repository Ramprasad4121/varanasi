#!/usr/bin/env bash
# Varanasi people app, PUBLIC DEMO mode (the build that would go on Vercel).
# No chain: the test ledger lives in the visitor's browser (app/lib/sim/engine.ts).
# Test money only. This script never deploys anything.
#
#   scripts/app-public.sh            # build and run on http://localhost:3200
#   scripts/app-public.sh --check    # waitlist test + demo ledger test + browser walk-through, stop
#
# Needs Node 22.18+ and npm; --check also needs playwright==1.48.0 + chromium for the walk-through
# (set SKIP_E2E=1 to skip it). Env: APP_PORT (default 3200), APP_BUILD_DIR (build in a copy).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}" no_proxy="127.0.0.1,localhost${no_proxy:+,$no_proxy}"
export APP_PORT="${APP_PORT:-3200}"
export NEXT_PUBLIC_VARANASI_MODE=public
export NEXT_TELEMETRY_DISABLED=1
CHECK=0; [ "${1:-}" = "--check" ] && CHECK=1

if curl -s --noproxy '*' -o /dev/null "http://127.0.0.1:$APP_PORT/" 2>/dev/null; then
  echo "port $APP_PORT is already in use. Stop it or set APP_PORT."; exit 1
fi

APPDIR="$ROOT/app"
if [ -n "${APP_BUILD_DIR:-}" ]; then
  mkdir -p "$APP_BUILD_DIR"
  (cd "$ROOT/app" && tar --exclude=node_modules --exclude=.next --exclude=.next-public --exclude=runtime --exclude=runtime-public -cf - .) | (cd "$APP_BUILD_DIR" && tar xf -)
  APPDIR="$APP_BUILD_DIR"
fi
export VARANASI_RUNTIME="$APPDIR/runtime-public"
mkdir -p "$VARANASI_RUNTIME"

PIDS=()
kill_tree() { local p="$1" c; for c in $(pgrep -P "$p" 2>/dev/null || true); do kill_tree "$c"; done; kill "$p" 2>/dev/null || true; }
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill_tree "$p"; done; }
trap cleanup EXIT INT TERM

if [ ! -d "$APPDIR/node_modules/next" ]; then
  (cd "$APPDIR" && npm install --ignore-scripts --no-audit --no-fund >/dev/null)
fi

if [ "$CHECK" = "1" ]; then
  echo "==> demo ledger test"
  (cd "$APPDIR" && node --no-warnings --import ./scripts/ts-hook.mjs scripts/sim-test.mjs)
fi

echo "==> build (public mode, into .next-public)"
BUILD_ID_FILE="$APPDIR/.next-public/BUILD_ID"
if [ ! -f "$BUILD_ID_FILE" ] || [ "${REBUILD:-0}" = "1" ] || [ -n "$(find "$APPDIR/app" "$APPDIR/components" "$APPDIR/lib" "$APPDIR/next.config.js" -newer "$BUILD_ID_FILE" -type f 2>/dev/null | head -1)" ]; then
  (cd "$APPDIR" && npx next build >"$VARANASI_RUNTIME/next-build.log" 2>&1) || { tail -40 "$VARANASI_RUNTIME/next-build.log"; exit 1; }
fi

if [ "$CHECK" = "1" ]; then
  # the app talks to a FAKE Upstash server that waitlist-test.mjs starts on this port
  export FAKE_KV_PORT="${FAKE_KV_PORT:-18700}"
  export KV_REST_API_URL="http://127.0.0.1:$FAKE_KV_PORT" KV_REST_API_TOKEN="fake-upstash-token-for-tests"
  export WAITLIST_ADMIN_TOKEN="local-test-admin-token-0123456789"
  export WAITLIST_UNSUB_SECRET="local-test-unsub-secret-0123456789" TEST_UNSUB_SECRET="local-test-unsub-secret-0123456789"
  (cd "$APPDIR" && exec node scripts/fake-upstash.mjs "$FAKE_KV_PORT" >"$VARANASI_RUNTIME/fake-upstash.log" 2>&1) &
  PIDS+=($!)
  export FAKE_KV_RUNNING=1
fi

echo "==> public demo on http://localhost:$APP_PORT"
(cd "$APPDIR" && exec npx next start -p "$APP_PORT" >"$VARANASI_RUNTIME/app.log" 2>&1) &
PIDS+=($!)
for _ in $(seq 1 100); do curl -s --noproxy '*' "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1 && break; sleep 0.3; done

if [ "$CHECK" = "1" ]; then
  echo "==> waitlist test"
  (cd "$APPDIR" && APP="http://127.0.0.1:$APP_PORT" node --no-warnings --import ./scripts/ts-hook.mjs scripts/waitlist-test.mjs)
  if [ "${SKIP_E2E:-0}" != "1" ]; then
    echo "==> browser walk-through (public mode)"
    APP="http://127.0.0.1:$APP_PORT" MODE_NAME=public SHOTS="${SHOTS:-}" python3 "$ROOT/app/e2e/e2e.py"
  fi
  echo "==> all good"
  exit 0
fi
echo "  Open http://localhost:$APP_PORT (narrow window). Ctrl+C stops it."
wait
