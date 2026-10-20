#!/bin/sh
# Starts the people app. With SEED=1 (docker compose), first waits for the local
# anvil chain at $RPC, deploys the demo contracts and seeds the demo story.
set -eu
if [ "${SEED:-0}" = "1" ]; then
  : "${RPC:?RPC must point at the local anvil chain}"
  echo "waiting for the local chain at $RPC"
  i=0
  until curl -fsS -X POST -H 'content-type: application/json' \
      --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPC" >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -gt 120 ] && { echo "chain not reachable"; exit 1; }
    sleep 1
  done
  if [ ! -f "$VARANASI_RUNTIME/deployment.json" ] || [ "${RESEED:-0}" = "1" ]; then
    RPC="$RPC" OUT="$CONTRACTS_OUT" RUNTIME="$VARANASI_RUNTIME" node scripts/seed.mjs
  fi
fi
exec npx next start -p "${APP_PORT:-3100}"
