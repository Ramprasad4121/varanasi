# AEGIS — Chainlink CRE Confidential Workflow

From-scratch entry for **ETHOnline Chainlink $2k Best Confidential Workflow**.
Built on the official [`hello-confidential-workflows-ts`](https://github.com/smartcontractkit/cre-templates)
starter template shape (`handlerInTee` + `TeeRuntime` + `usingTheDons()`), with the
template's demo scoring replaced by the real AEGIS risk heuristic.

**One-liner:** pool intel goes in in the clear, the operator's private risk
threshold / strategy weights / allowlist are applied **inside the TEE**, and only
the verdict `{poolId, riskScoreBps, decision}` leaves for DON consensus,
the Aegis agent API, and RiskGuard settlement on Sepolia.

> **⚠️ Private beta.** [Confidential Workflows](https://docs.chain.link/cre/concepts/confidential-workflows)
> require enrollment via your Chainlink account team to **deploy**
> ([request access](https://docs.chain.link/cre/account/confidential-workflows-access)).
> Simulation (below) works without it. Educational example, not audited — do not
> use in production without your own review.

## Files

| File | Purpose |
|------|---------|
| `workflow.ts` | TEE handler: HTTP trigger → `handlerInTee` → enclave scoring → agent-API POST → DON report |
| `risk.ts` | Pure scorer mirroring `agent/src/reason.ts` tiers; takes confidential params, returns verdict |
| `main.ts` | `Runner` bootstrap (template-canonical) |
| `workflow.test.ts` | `bun test`: 11 tests over pure logic + handler via fake `TeeRuntime` |
| `workflow.yaml` / `project.yaml` | CRE workflow + project settings (`cre/` is both project root and workflow dir, so `secrets-path: ./secrets.yaml`) |
| `config.staging.json` / `config.production.json` | Non-sensitive wiring (API URL, secret IDs) |
| `secrets.yaml` | Vault DON secret-ID → env-var mapping (4 secrets) |
| `.env.example` | Dummy local values; copy to `.env` (gitignored) for simulation |
| `http_trigger_payload.json` | Healthy-pool public input → expect `ACT` |
| `http_trigger_payload_skip.json` | Thin/stale/bearish pool → expect `SKIP` |
| `package.json` / `tsconfig.json` | `@chainlink/cre-sdk 1.18.0` (pinned to the scaffolded template's version), `viem`, `zod` |

## Setup

```bash
# 1. CRE CLI (https://docs.chain.link/cre/getting-started/cli-installation)
cre --version

# 2. Deps (bun for tests, npm for install — either works)
cd cre && npm install

# 3. Secrets for local simulation (Vault DON in production)
cp .env.example .env   # .env is gitignored; NEVER commit real values

# 4. Verify
./node_modules/.bin/tsc --noEmit   # typecheck (main → workflow → risk)
bun test                            # 11 pass
```

## Simulation (proof)

```bash
cd cre
cre workflow simulate ./ --target staging-settings \
  --non-interactive --trigger-index 0 \
  --http-payload ./http_trigger_payload.json
```

Real output (2026-09-06, CRE CLI 1.29.0, SDK 1.18.0) — healthy pool:

```
✓ Workflow compiled
  Binary hash: 8a7eab6e863b72558d2610e67cfee972cdcbaa0beed95552ac275bf7d122b6ca
[SIMULATION] Running trigger trigger=http-trigger@1.0.0-alpha
╭─ Trigger requested TEE Execution … AWS Nitro in us-west-2 ─╮
[USER LOG] Enclave verdict complete. pool=USDC/ETH-0.3% decision=ACT score=0bps posted=false
✓ Workflow Simulation Result:
"ACT @ 0bps for USDC/ETH-0.3% (agent API posted: false)"
```

Risky pool (`http_trigger_payload_skip.json`): `SKIP @ 6800bps for XYZ/ETH-1%`.

Agent-API POST path (stub on `127.0.0.1:3001/v1/verdict`) — same command, live stub:

```
[USER LOG] Enclave verdict complete. pool=USDC/ETH-0.3% decision=ACT score=0bps posted=true
```

Stub received (verdict triple only — no secrets on the wire beyond the auth header):

```
POST /v1/verdict  Authorization: Bearer dev-only-not-a-re…
{"poolId":"USDC/ETH-0.3%","riskScoreBps":0,"decision":"ACT"}
```

(`posted=false` without a listener is expected: the POST is best-effort so a
down agent API never fails the workflow; the signed DON report is the source of
truth for RiskGuard.)

## Architecture — what stays confidential vs what leaves

```
HTTP trigger {poolId, tvlUsd, volume24hUsd, alphaScore, operator?}   ← PUBLIC
        │  DON hands the request to an enclave
        ▼
╔═ ENCLAVE (TEE, handlerInTee / TeeRuntime) ═══════════════════════╗
║ CONFIDENTIAL (Vault DON → decrypted in-enclave via getSecret):   ║
║  • RISK_THRESHOLD_BPS — private ACT/SKIP cutoff                  ║
║  • STRATEGY_WEIGHTS   — private {liquidity,activity,alpha} mults ║
║  • OPERATOR_ALLOWLIST — private roster of approved agent wallets ║
║  • AEGIS_API_KEY      — credential for the verdict POST          ║
║                                                                  ║
║ COMPUTE (risk.ts, mirrors agent/src/reason.ts tiers):            ║
║  scorePoolRisk(public, confidential) → {riskScoreBps, decision}  ║
║                                                                  ║
║ EGRESS (still inside TEE):                                       ║
║  • POST {poolId, riskScoreBps, decision} → agent API /v1/verdict ║
║    (auth header stays confidential from node operators)          ║
╚═════════════════════╤════════════════════════════════════════════╝
                      │  usingTheDons() — ONE-WAY DOOR, verdict fields only
                      ▼
 WORKFLOW DON — report(string poolId, uint256 riskScoreBps, string decision)
   → attested + consensus-signed → RiskGuard.authorize(action, riskScore)
```

**Boundary rules enforced in code + tests:** the binary/logic is revealed (per
docs — only *data* is protected); `runtime.log` emits verdict fields only and
must be stripped before production deploy; `usingTheDons()` receives the three
verdict fields and nothing else; malformed public inputs throw before any
secret is touched.

## Gotchas found while building (for the orchestrator)

1. **`z.string().url()` never validates under `cre workflow simulate`.**
   The CRE WASM sandbox lacks the WHATWG `URL` global, so zod's `.url()` fails
   for *every* value (verified with `https://postman-echo.com`). `configSchema`
   uses `z.string().min(1)` + a manual `^https?://` check in the handler.
2. **`--http-payload @file` is not unpacked** — pass the bare path
   (`--http-payload ./http_trigger_payload.json`).
3. **TS `SecretsProvider` has no batch fetch** (per template README) — four
   sequential `runtime.getSecret()` calls.
4. **`cre/` merges project root + workflow dir** (single-workflow project), so
   `workflow.yaml` uses `secrets-path: ./secrets.yaml`, not `../secrets.yaml`.

## Demo plan (video, ~60–90s of the 2–4 min)

1. (10s) Show `secrets.yaml` + `.env` — "threshold, weights, allowlist live here, never in code."
2. (20s) `cre workflow simulate` with the healthy payload → TEE banner → `ACT @ 0bps`.
3. (20s) Same command with the SKIP payload → `SKIP @ 6800bps` — "same code path, private threshold decided."
4. (20s) Stub log line: `POST /v1/verdict {"poolId"…,"decision":"ACT"}` — "only the verdict leaves the enclave."
5. (10s) Point at `donRuntime.report(...)` — "this signed report is what RiskGuard settles on Sepolia."

## Prize checklist mapping

| Prize requirement | Where |
|---|---|
| CRE Workflow, from-scratch | `workflow.ts` + `main.ts` + `risk.ts` (this dir only) |
| Confidential Workflow (`handlerInTee`, real TEE handler) | `workflow.ts: initWorkflow` pins `[{tee:'nitro', regions:['us-west-2']}]`; sim prints the TEE banner |
| Sensitive input processed inside the enclave | threshold + weights + allowlist + API key via `getSecret`, all consumed by `scorePoolRisk` pre-crossover |
| Only verdict leaves for DON consensus / onchain | `usingTheDons()` receives `{poolId, riskScoreBps, decision}`; ABI-encoded `report()` for RiskGuard |
| Template spec compliance | Shape mirrors `hello-confidential-workflows-ts` (register → secrets → enclave capability call → `usingTheDons()` report) |
| Simulation proof | Outputs above; `bun test` (11 pass) + `tsc --noEmit` green |
| No other repo dirs touched, nothing committed | `git status` shows only untracked `cre/`; `.env`/`node_modules` gitignored |
