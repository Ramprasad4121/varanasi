# @varanasi/mcp-server

An MCP server (stdio) that gives any AI agent the Varanasi permission layer as tools, backed by the `@varanasi/sdk` sandbox.

**Sandbox, test money only. No money moves.**

## Tools

| Tool | What it does |
| --- | --- |
| `create_mandate` | Owner grants an agent a signed spend limit (per-payment cap, total cap, expiry, payees, categories). Pass `signedMandate` to register one the owner signed elsewhere. |
| `check_payment` | Would this payment be allowed? No debit. Logged. |
| `record_payment` | Atomic check and debit. Call right before paying; if `allowed` is false, do not pay. |
| `revoke_agent` | Revoke an agent now. Every mandate it holds stops working. |
| `get_ledger` | Append-only, hash-chained ledger (`chainIntact` tells you if it verifies). |
| `list_mandates` | Mandates with spent, remaining, revoked, active. |
| `sandbox_info` | Owner address, chain id, backend, whether server-side signing is on. |

Amounts are token base units as base-10 strings (`"5000000"` is 5 tUSDC with 6 decimals).

## Build

```bash
cd packages && npm ci && npm run build
```

## Claude Desktop

`claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "varanasi": {
      "command": "node",
      "args": ["/absolute/path/to/varanasi/packages/mcp-server/dist/index.js"],
      "env": { "VARANASI_LEDGER_PORT": "8787" }
    }
  }
}
```

## Cursor

`.cursor/mcp.json` in your project (or `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "varanasi": {
      "command": "node",
      "args": ["/absolute/path/to/varanasi/packages/mcp-server/dist/index.js"]
    }
  }
}
```

## Claude Code

```bash
claude mcp add varanasi -- node /absolute/path/to/varanasi/packages/mcp-server/dist/index.js
```

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `VARANASI_SANDBOX_OWNER_KEY` | random per run | Test-only key the sandbox owner signs with |
| `VARANASI_SANDBOX_SIGNING` | `1` | `0` makes `create_mandate` accept only `signedMandate`, so the server never signs for the owner |
| `VARANASI_LEDGER_PORT` | unset | Also serve the live ledger page on `127.0.0.1:<port>` |

Important: with sandbox signing on, whoever can call the server can create mandates. That is fine for a demo with test money and wrong for anything else. Outside the sandbox, set `VARANASI_SANDBOX_SIGNING=0` and have owners sign on their own device.

State is in memory and resets when the server restarts.

## Try it

Ask your agent: "Create a Varanasi mandate for agent 0x7099...79c8 on token 0x...5d01: 5000000 per payment, 20000000 total, category compute. Then check a 4000000 payment to 0x...c0de1, record it, try 9000000, revoke the agent, and show me the ledger."
