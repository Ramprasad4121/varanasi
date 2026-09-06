# AEGIS Agent — SKILL.md (The Graph AI tooling reuse contract)

Any Claude / Cursor / headless agent can drive live The Graph intel with this
tooling. No repo checkout required beyond `agent/`.

## 1. Discover (live)

```ts
import { SubgraphAgent } from "./src/mcp.js";
const sub = new SubgraphAgent();
// MCP-first: uses local Subgraph MCP server when present,
// else falls back to curated standardized IDs + direct Gateway.
await sub.searchSubgraphs("uniswap v3");      // search_subgraphs
await sub.searchSubgraphs("erc4626 vaults");
```

Curated defaults (`src/graph.ts` → `KNOWN_SUBGRAPHS`, env-overridable):

| key | subgraph id | schema |
|---|---|---|
| `uniswapV3` | `5zvR82QoaXYFy2Cp4tMPSGJUDHCxD15uGdsh9fSLwUqk` | Messari DEX (standardized) |
| `erc4626` | `6ad2e7db08338ef8f5d3bb126d2d912e033fd17b` | standardized vaults |

## 2. Schema → query (standardized pattern, one shape everywhere)

```ts
import { GraphClient, STANDARD_POOL_QUERY } from "./src/graph.js";
const g = new GraphClient(); // reads GRAPH_API_KEY, hits live Gateway
const pool = await g.poolIntel("<pool-id>");          // Uniswap V3 DEX schema
const vault = await g.vaultIntel("<vault-id>");       // same pattern, vaults schema
const top = await g.topPools(5);                      // discovery by TVL
const custom = await g.query("<any-subgraph-id>", STANDARD_POOL_QUERY, { id: "<id>" });
```

Endpoint shape (live, no mocks):
`https://gateway.thegraph.com/api/<GRAPH_API_KEY>/subgraphs/id/<SUBGRAPH_ID>`

## 3. Reason (don't dump raw Graph JSON)

```ts
import { analyzeRisk } from "./src/reason.js";
const verdict = analyzeRisk({ tvlUsd: pool.tvlUsd, volume24hUsd: pool.volume24hUsd, alphaScore: 0.4 });
// → { riskScoreBps, decision: "ACT" | "SKIP", rationale, factors }
```

Raw dump is a demo fail. The intel must flow into `analyzeRisk` (or the
`llmRationale` plug point) and out as a scored decision.

## 4. Local MCP server config (Claude Desktop / Cursor)

```json
{
  "mcpServers": {
    "subgraph": {
      "command": "npx",
      "args": ["-y", "@thegraph/subgraph-mcp"],
      "env": { "GRAPH_API_KEY": "<Subgraph Studio key>" }
    }
  }
}
```

Tools exposed through `src/mcp.ts` (`MCP_TOOLS`): `search_subgraphs`,
`get_schema`, `run_query`. Missing binary is never fatal — `SubgraphAgent`
degrades to direct Gateway.

## 5. Offline fixture (tests only)

`new GraphClient({ offline: true })` or `--offline` returns a local fixture.
It must never appear in a judging demo — `analyze` JSON reports
`"mode": { "graph": "live" | "offline" }` so judges can verify.
