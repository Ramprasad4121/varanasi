# varanasi — Chainlink CRE Confidential Workflows

Author: Ramprasad

From-scratch entry for **ETHOnline Chainlink $2k Best Confidential Workflow**.
Built on the official [`hello-confidential-workflows-ts`](https://github.com/smartcontractkit/cre-templates)
starter template shape (`handlerInTee` + `TeeRuntime` + `usingTheDons()`), with the
template's demo scoring replaced by the real varanasi heuristics.

**One-liner:** live in the clear, private parameters applied **inside the TEE**,
and only the verdict leaves for DON consensus, the varanasi agent API, and
on-chain settlement (RiskGuard / MandateTreeEscrow) on Sepolia. Two workflows
share one runner:

1. **Pool-risk** — `{poolId, riskScoreBps, decision}` → RiskGuard.
2. **Verdict network (quorum)** — an independent committee of TEE verdict nodes
   each emit `{taskId, nodeId, scoreBps, decision}` + a digest binding the vote
   to the attested report; the contract counts threshold agreement toward
   release (`submitNodeVerdict`).

> **⚠️ Private beta.** [Confidential Workflows](https://docs.chain.link/cre/concepts/confidential-workflows)
> require enrollment via your Chainlink account team to **deploy**
> ([request access](https://docs.chain.link/cre/account/confidential-workflows-access)).
> Simulation (below) works without it. Educational example, not audited — do not
> use in production without your own review.

## Files

| File | Purpose |
|------|---------|
| `workflow.ts` | Pool-risk TEE handler: HTTP trigger → `handlerInTee` → enclave scoring → agent-API POST → DON report |
| `risk.ts` | Pure pool scorer mirroring `agent/src/reason.ts` tiers; takes confidential params, returns verdict |
| `verdict.ts` | Verdict-network TEE handler: `scoreDeliverable` rubric → node verdict → agent-API POST → DON report |
| `quorum.ts` | Pure aggregation (`aggregateVerdicts`, mirrors on-chain `agreeCount`) + canonical report encoding (`reportDigest`) binding on-chain votes to attested reports |
| `main.ts` | `Runner` bootstrap registering both workflows under a merged config schema (template-canonical) |
| `workflow.test.ts` | `bun test`: 11 tests over pool-risk logic + handler via fake `TeeRuntime` |
| `verdict.test.ts` | `bun test`: 17 tests over verdict scoring, reportDigest, quorum aggregation, and the TEE handler |
| `workflow.yaml` / `project.yaml` | CRE workflow + project settings (`cre/` is both project root and workflow dir, so `secrets-path: ./secrets.yaml`) |
| `config.staging.json` / `config.production.json` | Non-sensitive wiring (API URL, secret IDs, `requiredQuorum`) |
| `secrets.yaml` | Vault DON secret-ID → env-var mapping (7 secrets) |
| `.env.example` | Dummy local values; copy to `.env` (gitignored) for simulation |
| `http_trigger_payload.json` | Healthy-pool public input → expect `ACT` |
| `http_trigger_payload_skip.json` | Thin/stale/bearish pool → expect `SKIP` |
| `http_trigger_verdict.json` | Healthy deliverable + node → expect `APPROVE` |
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
./node_modules/.bin/tsc --noEmit   # typecheck (main → workflow/verdict/quorum)
bun test                            # 28 pass
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

Verdict workflow (trigger index 1 — the second registered workflow):

```bash
cd cre
cre workflow simulate ./ --target staging-settings \
  --non-interactive --trigger-index 1 \
  --http-payload ./http_trigger_verdict.json
```

Expected call to `onVerdictTrigger` (healthy deliverable, default local secrets):

```
[USER LOG] Node verdict complete. task=0xabab… decision=APPROVE score=10000bps posted=false
✓ Workflow Simulation Result:
"APPROVE @ 10000bps for 0xabab… (agent API posted: false)"
```

The relay then calls `MandateTreeEscrow.submitNodeVerdict(taskId, 10000, reportDigest(verdict))`;
`quorum.ts aggregateVerdicts()` shows the committee-level summary (agreeCount vs `requiredQuorum`).

Agent-API POST path (stub on `127.0.0.1:3001` — `/v1/verdict` for pool-risk,
`/v1/verdicts` for verdict nodes) — same command, live stub:

```
[USER LOG] Enclave verdict complete. pool=USDC/ETH-0.3% decision=ACT score=0bps posted=true
```

Stub received (verdict triple only — no secrets on the wire beyond the auth header):

```
POST /v1/verdict  Authorization: Bearer dev-only-not-a-real…
{"poolId":"USDC/ETH-0.3%","riskScoreBps":0,"decision":"ACT"}
```

A verdict-node POST body carries `{taskId, nodeId, scoreBps, decision, reportHash}` —
the `reportHash` being `quorum.ts`'s `reportDigest`, which the agent API relays on-chain.

(`posted=false` without a listener is expected: the POST is best-effort so a
down agent API never fails the workflow; the signed DON report is the source of
truth for RiskGuard / submitNodeVerdict.)

## Architecture — what stays confidential vs what leaves

One runner, two TEE workflows. Both registered in `main.ts` under a merged
config schema; each handler reads only its own fields and secret IDs.

### 1. Pool risk (ACT/SKIP)

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

### 2. Verdict network (quorum, APPROVE/REJECT)

Each committee node operator runs this workflow independently; the contract
counts `scoreBps >= pinnedThresholdBps` votes toward `requiredQuorum`.

```
HTTP trigger {taskId, nodeId, deliverableUri, milestones, onTime, aligned}  ← PUBLIC
        │  DON hands the request to an enclave
        ▼
╔═ ENCLAVE (TEE, handlerInTee / TeeRuntime) ══════════════════════════════╗
║ CONFIDENTIAL (Vault DON → decrypted in-enclave via getSecret):          ║
║  • VERDICT_QUALITY_BAR_BPS — private APPROVE bar (≈ on-chain threshold) ║
║  • VERDICT_RUBRIC_WEIGHTS  — private {completeness,timeliness,budget}   ║
║  • VERDICT_NODE_ROSTER     — private roster of authorized node addrs    ║
║  • AEGIS_API_KEY           — credential for the verdict POST            ║
║                                                                         ║
║ COMPUTE (verdict.ts rubric):                                            ║
║  scoreDeliverable(public, confidential) → {taskId, nodeId, scoreBps,    ║
║                                            decision}                    ║
║                                                                         ║
║ EGRESS (still inside TEE):                                              ║
║  • POST {taskId, nodeId, scoreBps, decision, reportHash} → /v1/verdicts ║
╚═════════════════════════╤═══════════════════════════════════════════════╝
                          │  usingTheDons() — ONE-WAY DOOR, verdict fields only
                          ▼
  WORKFLOW DON — report(string taskId, string nodeId, uint256 scoreBps, string decision)
   → attested + consensus-signed; reportHash = reportDigest(verdict) (quorum.ts)
   → relay calls MandateTreeEscrow.submitNodeVerdict(taskId, scoreBps, reportHash)
```

**Boundary rules enforced in code + tests:** the binary/logic is revealed (per
docs — only *data* is protected); `runtime.log` emits verdict fields only and
must be stripped before production deploy; `usingTheDons()` receives the
verdict fields and nothing else; malformed public inputs throw before any
secret is touched. `quorum.ts` owns the single canonical ABI + digest so the
TEE report (hexToBase64 payload), the on-chain `reportHash`, and the relay all
agree byte-for-byte.

## Gotchas found while building (for the orchestrator)

1. **`z.string().url()` never validates under `cre workflow simulate`.**
   The CRE WASM sandbox lacks the WHATWG `URL` global, so zod's `.url()` fails
   for *every* value (verified with `https://postman-echo.com`). `configSchema`
   uses `z.string().min(1)` + a manual `^https?://` check in the handler.
2. **`--http-payload @file` is not unpacked** — pass the bare path
   (`--http-payload ./http_trigger_payload.json`).
3. **TS `SecretsProvider` has no batch fetch** (per template README) — four
   sequential `runtime.getSecret()` calls per workflow.
4. **`cre/` merges project root + workflow dir** (single-workflow project), so
   `workflow.yaml` uses `secrets-path: ./secrets.yaml`, not `../secrets.yaml`.
5. **viem's `encodeAbiParameters` is typed `Hex`, not `Uint8Array`** — the
   DON-report payload (and thus `reportDigest`) is a `0x` string; `quorum.ts`
   types it `Hex` so `hexToBase64` / `keccak256` accept it.
6. **Runner takes ONE merged config schema.** Both workflows declare separate
   `configSchema` objects; `main.ts` merges them (`pool.merge(verdict)`) and
   registers both with `runner.run()`. `aegisApiUrl` lives in the pool schema
   only; `verdict.ts`'s `VerdictConfig` re-exposes it via a type intersection.
7. **Verdict-node votes are per-node reports.** Each node computes its own
   digest; the contract pins `VerdictMode.Quorum` + `requiredQuorum` at the
   first vote, then release needs `agreeCount >= requiredQuorum` (and
   `nodeCount <= MAX_QUORUM_NODES`). `aggregateVerdicts` mirrors that counting
   off-chain.

## Demo plan (video, ~60–90s of the 2–4 min)

1. (10s) Show `secrets.yaml` + `.env` — "threshold, weights, allowlist, rubric live here, never in code."
2. (20s) `cre workflow simulate` with the healthy payload → TEE banner → `ACT @ 0bps`.
3. (20s) Same command with the SKIP payload → `SKIP @ 6800bps` — "same code path, private threshold decided."
4. (15s) `--trigger-index 1` with `http_trigger_verdict.json` → `APPROVE @ 10000bps` — "a verdict-network node's independent vote."
5. (15s) `quorum.ts` demo: `aggregateVerdicts` over 3 nodes → `RELEASE` when `agreeCount >= requiredQuorum`.
6. (10s) Point at `donRuntime.report(...)` — "this signed report is what RiskGuard / submitNodeVerdict settle on Sepolia."

## Prize checklist mapping

| Prize requirement | Where |
|---|---|
| CRE Workflow, from-scratch | `workflow.ts` + `verdict.ts` + `quorum.ts` + `main.ts` + `risk.ts` (this dir only) |
| Confidential Workflow (`handlerInTee`, real TEE handler) | both `initWorkflow` fns pin `[{tee:'nitro', regions:['us-west-2']}]`; sim prints the TEE banner |
| Sensitive input processed inside the enclave | per workflow: threshold + weights + allowlist / quality bar + rubric + roster + API key via `getSecret`, all consumed pre-crossover |
| Only verdict leaves for DON consensus / onchain | each `usingTheDons()` receives verdict fields only; ABI-encoded `report()` for RiskGuard / submitNodeVerdict |
| Template spec compliance | Shape mirrors `hello-confidential-workflows-ts` (register → secrets → enclave capability call → `usingTheDons()` report) |
| Simulation proof | Outputs above; `bun test` (28 pass) + `tsc --noEmit` green |
| No other repo dirs touched, nothing committed | `git status` shows only untracked `cre/`; `.env`/`node_modules` gitignored |
