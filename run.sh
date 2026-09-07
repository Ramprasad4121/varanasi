#!/usr/bin/env bash
# Author: Ramprasad — varanasi one-command runner.
# Usage: ./run.sh        boots signal service (:4021) + web (:3000)
#        ./run.sh stop   stops both
#        ./run.sh agent  runs the full agent loop once (ENS -> Graph -> x402 -> verdict)
# Requires: node 24, npm deps installed per package (see README), gitignored
# .env files present (service/.env, agent/.env). Never prints secrets.
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
SVC_LOG=/tmp/varanasi-service.log
WEB_LOG=/tmp/varanasi-web.log

stop() {
  pkill -f "tsx watch src/server.ts" 2>/dev/null
  pkill -f "next-server" 2>/dev/null
  pkill -f "next dev" 2>/dev/null
  echo "stopped."
}

wait_for() { # $1=url $2=name
  for _ in $(seq 1 30); do
    curl -sf -m 3 "$1" >/dev/null 2>&1 && { echo "$2 up: $1"; return 0; }
    sleep 2
  done
  echo "$2 FAILED to start (see ${3:-log})" >&2
  return 1
}

case "${1:-}" in
  stop) stop; exit 0 ;;
  agent)
    (cd "$ROOT/agent" && npx tsx src/cli.ts analyze \
      --agent sentinel-1.aegis.eth \
      --pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 --no-mcp)
    exit $? ;;
esac

stop >/dev/null 2>&1
(cd "$ROOT/service" && nohup npm run dev >"$SVC_LOG" 2>&1 &) 
(cd "$ROOT/frontend" && nohup npm run dev >"$WEB_LOG" 2>&1 &)
wait_for http://localhost:4021/health "signal service" "$SVC_LOG" || tail -5 "$SVC_LOG"
wait_for http://localhost:3000 "web" "$WEB_LOG" || tail -5 "$WEB_LOG"
echo "done. agent loop: ./run.sh agent"
