#!/usr/bin/env bash
# Varanasi people app: one command local demo.
#   1. starts a LOCAL anvil chain (clock starts 6 days in the past so demo dates read naturally)
#   2. builds and deploys the gold, chit and gold loan contracts (mock bank, mock gold price, mock rupee)
#   3. seeds a demo user (Ravi, phone 98765 43210, code 123456) with 12.450 g of gold,
#      one running chit (month 2 due) and one chit invitation
#   4. runs the app at http://localhost:3100
#
#   scripts/app-demo.sh            # demo, stays running until Ctrl+C
#   scripts/app-demo.sh --check    # start everything, run the API smoke test, stop
#   scripts/app-demo.sh --e2e      # --check, then reset the chain to the seeded story and
#                                  # run the browser walk-through (app/e2e/e2e.py), stop
#
# Needs: Foundry (forge, anvil), Node 18+, npm. --e2e also needs
#   pip install playwright==1.48.0 && python3 -m playwright install chromium
# Nothing touches a public network. Keys are anvil's public dev keys. The bank, gold
# price and rupee are MOCKS. Test money only.
# Env: CHAIN_PORT (default 18645), APP_PORT (default 3100), APP_BUILD_DIR (build the
# app in a copy, e.g. /tmp/people-app, when the repo disk is slow or tight),
# REBUILD=1 forces a fresh next build (it also rebuilds by itself when app source is newer).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"
export NO_PROXY="127.0.0.1,localhost${NO_PROXY:+,$NO_PROXY}" no_proxy="127.0.0.1,localhost${no_proxy:+,$no_proxy}"
CHAIN_PORT="${CHAIN_PORT:-18645}"
export CHAIN_PORT
export APP_PORT="${APP_PORT:-3100}"
RPC="http://127.0.0.1:$CHAIN_PORT"
MODE="run"
case "${1:-}" in
  --check) MODE="check" ;;
  --e2e) MODE="e2e" ;;
  "") ;;
  *) echo "usage: $0 [--check|--e2e]"; exit 2 ;;
esac

for bin in forge anvil node npm curl; do
  command -v "$bin" >/dev/null || { echo "missing $bin (install Foundry: curl -L https://foundry.paradigm.xyz | bash; foundryup)"; exit 1; }
done

if curl -s --noproxy '*' -o /dev/null "http://127.0.0.1:$APP_PORT/" 2>/dev/null; then
  echo "port $APP_PORT is already in use (an old app still running?). Stop it or set APP_PORT."; exit 1
fi

APPDIR="$ROOT/app"
if [ -n "${APP_BUILD_DIR:-}" ]; then
  mkdir -p "$APP_BUILD_DIR"
  (cd "$ROOT/app" && tar --exclude=node_modules --exclude=.next --exclude=.next-public --exclude=runtime --exclude=runtime-public -cf - .) | (cd "$APP_BUILD_DIR" && tar xf -)
  APPDIR="$APP_BUILD_DIR"
fi
export VARANASI_RUNTIME="$APPDIR/runtime"
mkdir -p "$VARANASI_RUNTIME"

PIDS=()
# kill a process and all its children (npx -> next -> node workers)
kill_tree() {
  local p="$1" c
  for c in $(pgrep -P "$p" 2>/dev/null || true); do kill_tree "$c"; done
  kill "$p" 2>/dev/null || true
}
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill_tree "$p"; done; }
trap cleanup EXIT INT TERM

rpc() {
  curl -s --noproxy '*' -X POST -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":${2:-[]}}" "$RPC"
}

echo "==> local chain on $RPC"
START_TS=$(( $(date +%s) - 6 * 86400 ))
anvil --port "$CHAIN_PORT" --silent --chain-id 31337 --timestamp "$START_TS" >"$VARANASI_RUNTIME/anvil.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 50); do
  rpc eth_chainId >/dev/null 2>&1 && break
  sleep 0.2
done

echo "==> build contracts"
(cd "$ROOT/contracts" && forge build --skip test --skip script >/dev/null)

echo "==> app packages"
if [ ! -d "$APPDIR/node_modules/next" ]; then
  (cd "$APPDIR" && npm install --ignore-scripts --no-audit --no-fund >/dev/null)
fi

echo "==> deploy and seed the demo"
(cd "$APPDIR" && RPC="$RPC" OUT="$ROOT/contracts/out" RUNTIME="$VARANASI_RUNTIME" node scripts/seed.mjs)
# remember the seeded chain so --e2e can start the browser walk-through from the same story
SNAP=$(rpc evm_snapshot | sed -E 's/.*"result":"([^"]+)".*/\1/')

echo "==> build the app"
STALE=0
if [ ! -f "$APPDIR/.next/BUILD_ID" ] || [ "${REBUILD:-0}" = "1" ]; then
  STALE=1
elif [ -n "$(find "$APPDIR/app" "$APPDIR/components" "$APPDIR/lib" "$APPDIR/next.config.js" "$APPDIR/package.json" -newer "$APPDIR/.next/BUILD_ID" -type f 2>/dev/null | head -1)" ]; then
  echo "    app source changed since the last build, rebuilding"
  STALE=1
fi
if [ "$STALE" = "1" ]; then
  (cd "$APPDIR" && npx next build >"$VARANASI_RUNTIME/next-build.log" 2>&1) || { tail -40 "$VARANASI_RUNTIME/next-build.log"; exit 1; }
fi
# never serve chain reads cached by an older build
rm -rf "$APPDIR/.next/cache/fetch-cache"

start_app() {
  (cd "$APPDIR" && exec npx next start -p "$APP_PORT" >"$VARANASI_RUNTIME/app.log" 2>&1) &
  APP_PID=$!
  PIDS+=("$APP_PID")
  for _ in $(seq 1 100); do
    curl -s --noproxy '*' "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1 && return 0
    sleep 0.3
  done
  echo "app did not start"; tail -30 "$VARANASI_RUNTIME/app.log"; exit 1
}

echo "==> app on http://localhost:$APP_PORT"
start_app

if [ "$MODE" != "run" ]; then
  echo "==> API smoke test"
  (cd "$APPDIR" && APP="http://127.0.0.1:$APP_PORT" node scripts/smoke.mjs)
  if [ "$MODE" = "e2e" ]; then
    echo "==> reset chain to the seeded story"
    rpc evm_revert "[\"$SNAP\"]" >/dev/null
    # move the clock forward to now-ish so fresh receipts do not go back in time
    rpc evm_mine >/dev/null
    echo "==> browser walk-through"
    APP="http://127.0.0.1:$APP_PORT" MODE_NAME=local SHOTS="${SHOTS:-}" python3 "$ROOT/app/e2e/e2e.py"
  fi
  echo "==> all good"
  exit 0
fi

cat <<EOF

  Open http://localhost:$APP_PORT on your phone browser or laptop (narrow window).
  Tap "Try the demo", then "Use demo account (Ravi)" or sign in with 98765 43210, code 123456.
  Other demo phones: 90000 00001 (Lakshmi) ... 90000 00004 (Venkatesh).
  Ctrl+C stops the app and the local chain.
EOF
wait
