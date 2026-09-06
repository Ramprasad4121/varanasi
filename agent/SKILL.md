# AEGIS Agent — SKILL.md (The Graph AI tooling reuse contract)

Any Claude / Cursor / headless agent can drive live The Graph intel with this
tooling. No repo checkout required beyond `agent/`.

## 1. Discover (live)

```ts
import { SubgraphAgent } from "./src/mcp.js";
const sub = new SubgraphAgent();
// MCP-first: uses local Subgraph MCP server when present,
// else falls back to curated official Uniswap IDs + direct Gateway.
await sub.searchSubgraphs("uniswap v3");      // search_subgraphs
await sub.searchSubgraphs("uniswap v2");
```

Curated defaults (`src/graph.ts` → `KNOWN_SUBGRAPHS`, env-overridable):

| key | subgraph id | schema |
|---|---|---|
| `uniswapV3` | `5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV` | Uniswap-native (`pool`/`pools`) |
| `uniswapV2` | `A3Np3RQbaBA6oKJgiwDJeo5T3zrYfGHPWFYayMwtNDum` | Uniswap-native (`pair`/`pairs`) |
| `uniswapV4` | `DiYPVdygkfjDWhbxGSqAQxwBKmfKnkWQojqeM2rkLb3G` | Uniswap-native |

Endpoint shape (live, no mocks):
`https://gateway.thegraph.com/api/<GRAPH_API_KEY>/subgraphs/id/<SUBGRAPH_ID>`

## 2. Schema → query (Uniswap-native pattern)

```ts
import { GraphClient, UNISWAP_POOL_QUERY, CURATED_POOLS } from "./src/graph.js";
const g = new GraphClient(); // reads GRAPH_API_KEY, hits live Gateway
const pool = await g.poolIntel("0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640"); // USDC/WETH 0.05% (V3)
const pair = await g.pairIntel("<pair-id>");      // Uniswap V2 (pair/pairs)
const top = await g.topPools(5);                  // discovery by TVL (sanity-filtered)
const custom = await g.query("<any-subgraph-id>", UNISWAP_POOL_QUERY, { id: "<id>" });
```

Pinned curated pools (`CURATED_POOLS` — always prefer over TVL ordering):

| pool | id |
|---|---|
| USDC/WETH 0.05% | `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640` |
| USDC/WETH 0.3% | `0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8` |
| WBTC/WETH 0.3% | `0xcbcdf9626bc03e24f779434178a73a0b4bad62ed` |

WARNING: top-by-TVL ordering includes spam pools with fake TVL (e.g. a token
named "ease.org") — never trust `orderBy: totalValueLockedUSD` blindly.
`topPools()` overfetches and drops rows with TVL > $50B (`MAX_SANE_TVL_USD`)
or junk symbols (empty / containing `/`); demos must pin `CURATED_POOLS`.

## 3. Reason (don't dump raw Graph JSON)

```ts
import { analyzeRisk } from "./src/reason.js";
const verdict = analyzeRisk({ tvlUsd: pool.tvlUsd, volume24hUsd: pool.volume24hUsd, alphaScore: 0.4 });
// → { riskScoreBps, decision: "ACT" | "SKIP", rationale, factors }
```

Raw dump is a demo fail. The intel must flow into `analyzeRisk` (or the
`reasonWithLLM` LLM path) and out as a scored decision.

### LLM reasoning (opt-in)

```ts
import { reasonWithLLM } from "./src/brain.js";
const verdict = await reasonWithLLM(
  { tvlUsd: pool.tvlUsd, volume24hUsd: pool.volume24hUsd, fees24hUsd: pool.fees24hUsd },
  { score: 0.4, direction: "long" },
  { authorized: true },
  5000,
);
// → { riskScoreBps, decision, rationale, factors, llm: true|false }
```

Env: `LLM_BASE_URL` (default `http://localhost:1234/v1` — local LM Studio,
no key needed), `LLM_API_KEY` (required only for remote base URLs, never log
it), `LLM_MODEL` (default `local-model`). Opt-in via CLI `--llm` (default
off — behavior unchanged). ANY LLM failure (no key, timeout, bad JSON,
schema violation) falls back to the `analyzeRisk` heuristic with
`{ llm: false }`; `analyze` JSON also reports
`"mode": { "reason": "heuristic" | "llm-with-heuristic-fallback" }`.

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
