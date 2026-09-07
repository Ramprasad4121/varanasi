# varanasi × Bazantic — "Risk-gated swap check" recipe

Author: Ramprasad

Bazantic tracks targeted: **Best Recipe ($1k)** + **Agentify ($1k)**.
All integration files live in `bazantic/` only — nothing else in the repo is touched.

- `openapi-signal.yaml` — OpenAPI 3.0 spec of the varanasi x402 signal service, for Bazantic gateway import.
- `recipe.json` — the recipe definition (3 chained steps, when/why/inputs/outputs per step).
- `RECIPE.md` — this file: setup, recording script, attribution, prize checklist.

No secrets in this directory. Keys/URLs below are placeholders you fill in on bazantic.com, never in git.

## 1. Account setup (human steps, ~20 min)

1. **Create a Bazantic account** at https://bazantic.com and note your username:
   `Bazantic username: <YOUR_BAZANTIC_USERNAME>` (also fill it into `recipe.json`'s `by` field).
2. **Deploy the varanasi signal service** (or expose it) so it has a public URL:
   `cd service && npm install && HEDERA_SERVICE_ACCOUNT_ID=<receiver> npm run dev`
   (or your hosted URL). Confirm `GET <URL>/health` returns `{"status":"ok",...}`.
   Note the URL: `varanasi service URL: <YOUR_SERVICE_URL>`.
3. **Create an x402/MPP Gateway on Bazantic for our API:**
   - In Bazantic dashboard → Gateways → New x402 Gateway.
   - Import `bazantic/openapi-signal.yaml` (set `servers[0].url` to `<YOUR_SERVICE_URL>` first).
   - Fund the gateway payer wallet with a little Hedera testnet HBAR (covers the $0.01 signal calls).
   - Smoke-test inside Bazantic: `GET /health`, `GET /402-info`, then `POST /v1/score` (expect 402 → paid 200 + receipt).
4. **Create an MCP server entry (Agentify leg):** expose the gateway's tools
   (`getAlphaSignal`, `getRiskScore`, plus a The Graph fetch tool) as a Bazantic MCP server
   so an agent can run the recipe end-to-end.
5. **Create the Recipe:** Recipes → New → paste `bazantic/recipe.json`
   (or rebuild the 3 steps in the UI: ① The Graph Uniswap intel →
   ② varanasi x402 signal → ③ RiskGuard authorize read → ACT/SKIP).
   For step ① use your Subgraph Studio key in the Gateway URL field on-site
   (`https://gateway.thegraph.com/api/<YOUR_GRAPH_API_KEY>/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`) —
   never paste it into this repo.
6. **Run the recipe once live** (pinned pool `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640`,
   symbol `ETH/USDC`) and save: the ACT/SKIP output, the HashScan tx link from the receipt,
   and the recipe run URL on bazantic.com.

## 2. Screen-recording script (submission video, ~2–3 min)

Record in one continuous take, 1080p, mic on:

| # | Time | Show | Say |
|---|------|------|-----|
| 0 | 0:00–0:15 | bazantic.com dashboard logged in as `<YOUR_BAZANTIC_USERNAME>`, recipe "Risk-gated swap check" open | "This is our Bazantic Best Recipe entry: a risk-gated swap check chaining two services." |
| 1 | 0:15–0:50 | Step ① run: The Graph Gateway query on Uniswap V3 pool `0x88e6…5640`, TVL + volume returned | "First, live Uniswap intel from The Graph — real TVL and volume, pinned pool, no mocks." |
| 2 | 0:50–1:30 | Step ② run: `POST /v1/signal` → 402 → paid 200 via gateway; show signal + confidence + receipt | "Second, the paid varanasi alpha signal over x402 on Hedera testnet — one cent, settled on-chain." |
| 3 | 1:30–1:50 | Open `receipt.hashscanTxUrl` in a browser tab | "Here is the settlement proof on HashScan." |
| 4 | 1:50–2:20 | Step ③: RiskGuard `authorize` read → final ACT/SKIP with rationale | "Third, the RiskGuard guardrail. ACT only if pool, signal, and authorization all pass — the result depends on both services." |
| 5 | 2:20–2:40 | Recipe run URL + MCP server entry (Agentify leg) on screen | "The full run and the MCP server are linked below, by `<YOUR_BAZANTIC_USERNAME>`." |

Export as `bazantic-demo.mp4` (keep it unlisted-upload friendly) and link it in the submission.

## 3. Prize checklist mapping

### Best Recipe ($1k)
- [ ] Recipe uses **≥2 services** in one working flow: The Graph Uniswap data (sponsor API) + varanasi x402 signal (our API).
- [ ] One chained service is a **hackathon sponsor API** (The Graph).
- [ ] **Result depends on both**: documented in `recipe.json` → `decisionPolicy.dependsOnBoth` (no pool facts → SKIP; no signal edge → SKIP).
- [ ] Each step has **when/why/how** guidance: `recipe.json` steps all carry when/why/inputs/outputs/gate.
- [ ] Working demo: recipe run URL + screen recording (§2) showing live (non-mock) calls.
- [ ] Attribution: `<YOUR_BAZANTIC_USERNAME>` in recipe + video.

### Agentify ($1k)
- [ ] varanasi service imported into Bazantic as an **x402 gateway** (`openapi-signal.yaml`).
- [ ] Gateway tools exposed as an **MCP server** so an agent can call them.
- [ ] Agent runs the recipe end-to-end (see recording shot #5): fetch intel → pay for signal → authorize → ACT/SKIP.
- [ ] Receipt/HashScan proof linked (machine-speed paid API consumption by an agent).

## 4. Human-needed items (cannot be done by the agent)

- [ ] Bazantic account + username → fill `<YOUR_BAZANTIC_USERNAME>` here and in `recipe.json`.
- [ ] Public service URL → fill `<YOUR_SERVICE_URL>` and set it in `openapi-signal.yaml` `servers[0].url` before import.
- [ ] Funded Hedera testnet payer for the gateway (tiny HBAR amount).
- [ ] Subgraph Studio key (`<YOUR_GRAPH_API_KEY>`, entered on-site only).
- [ ] RiskGuard Sepolia address → fill `<RISKGUARD_SEPOLIA_ADDRESS>` in `recipe.json` after deployment.
- [ ] Run + record the video (§2), submit both track forms with recipe run URL.
