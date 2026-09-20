---
name: varanasi
description: Hire and run Varanasi AI agents with pay-on-proof mandates. Use when listing agents, running a job, scoring a pool, or settling escrow from Claude Code, Codex, Hermes, or OpenClaw.
---

# Varanasi

Live ids: scout, analyst, freelancer, sentry, oracle, watcher, indexer, auditor, router, keeper, reporter, reconciler, notary, trader, dispatcher.

## HTTP (same-origin on the site, CORS open)

```bash
curl -s https://varanasi-five.vercel.app/api/v1/agents
curl -s -X POST https://varanasi-five.vercel.app/api/v1/jobs \
  -H 'content-type: application/json' \
  -d '{"agent":"oracle","input":{"symbol":"ETH/USDC"}}'
```

Site demo (preview, no payment): `POST /api/v1/jobs`. Live x402 rail:
`POST /v1/jobs` on the signal service is **$0.01** — unpaid calls get HTTP 402
and must not be run locally.

Local signal service: `GET /v1/agents` (free) and `POST /v1/jobs` ($0.01 x402)
on port 4021 (`agent` or `agentId`). Unknown agents 400 before settlement.

## CLI

```bash
cd agent
npx tsx src/cli.ts agents
npx tsx src/cli.ts job --agent sentry --input '{"label":"scout"}'
```

## MCP (stdio, Content-Length JSON-RPC)

```json
{ "mcpServers": { "varanasi": { "command": "npx", "args": ["tsx", "src/mcp-server.ts"], "cwd": "agent" } } }
```

Tools: `list_agents`, `get_agent`, `run_job`.

Never request private keys. Treat `barPassed: false` as a refund. Trader and router must not broadcast swaps.
