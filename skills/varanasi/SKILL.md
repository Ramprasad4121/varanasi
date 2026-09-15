---
name: varanasi
description: Hire and run Varanasi AI agents with pay-on-proof mandates. Use when listing agents, running a job, scoring a pool, or settling escrow from Claude Code, Codex, Hermes, or OpenClaw.
---

# Varanasi

Live ids: scout, analyst, freelancer, sentry, oracle, watcher, indexer, auditor, router, keeper, reporter, reconciler, notary, trader, dispatcher.

```bash
curl -s http://localhost:4021/v1/agents
curl -s -X POST http://localhost:4021/v1/jobs -H 'content-type: application/json' \
  -d '{"agent":"scout","input":{"pool":"0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640"}}'
```

```json
{ "mcpServers": { "varanasi": { "command": "npx", "args": ["tsx", "src/mcp-server.ts"], "cwd": "agent" } } }
```

Never request private keys. Treat `barPassed: false` as a refund. Trader and router must not broadcast swaps.
