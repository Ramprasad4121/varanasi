/**
 * @author Ramprasad
 * @module workflow — CRE confidential risk workflow: TEE HTTP handler + DON report.
 *
 * Purpose: validate public pool inputs in-enclave, apply confidential Vault DON
 * secrets (threshold/weights/allowlist/API key) via scorePoolRisk, best-effort
 * POST the verdict triple to the varanasi agent API, and cross to the Workflow
 * DON for a consensus-signed report consumed by RiskGuard.
 *
 * Env deps: none read directly (non-sensitive wiring arrives via validated
 * `configSchema`; secrets arrive via `runtime.getSecret` from the Vault DON).
 */
import {
  cre,
  hexToBase64,
  ok,
  text,
  type HTTPPayload,
  type TeeRuntime,
} from '@chainlink/cre-sdk'
import { encodeAbiParameters, parseAbiParameters } from 'viem'
import { z } from 'zod'
import { scorePoolRisk, type ConfidentialParams, type PoolPublicInputs, type RiskVerdict } from './risk'

// ─── Config Schema ──────────────────────────────────────────
// Non-sensitive wiring only. Every value that must stay private lives in the
// Vault DON and is referenced here by secret ID (see ../secrets.yaml).
export const configSchema = z.object({
  // varanasi agent API base URL — verdicts are POSTed to `<aegisApiUrl>/v1/verdict`.
  // NOTE: plain z.string(), NOT z.string().url(). The CRE WASM sandbox does not
  // provide the WHATWG URL global, so zod's .url() check unconditionally fails
  // at `cre workflow simulate` time ("Invalid url" for ANY value, including
  // https://postman-echo.com). Scheme is checked manually in `onHttpTrigger`.
  aegisApiUrl: z.string().min(1),
  thresholdSecretId: z.string().default('RISK_THRESHOLD_BPS'),
  weightsSecretId: z.string().default('STRATEGY_WEIGHTS'),
  allowlistSecretId: z.string().default('OPERATOR_ALLOWLIST'),
  apiKeySecretId: z.string().default('AEGIS_API_KEY'),
})
type Config = z.infer<typeof configSchema>

// ─── Public trigger input ───────────────────────────────────
// Sent in the clear with every HTTP trigger request. Zod-validated inside the
// enclave so malformed payloads fail fast before touching any secret.
const publicInputSchema = z.object({
  poolId: z.string().min(1),
  tvlUsd: z.number().nonnegative(),
  volume24hUsd: z.number().nonnegative(),
  alphaScore: z.number().min(-1).max(1).default(0),
  operator: z.string().optional(),
})

// ─── Logic over confidential data ───────────────────────────
// `scorePoolRisk` (./risk.ts) runs ENTIRELY inside the enclave: the private
// risk threshold, the operator's strategy weights, and the operator allowlist
// are inputs to that computation, and none of them cross `usingTheDons()`.
// Only the verdict — {poolId, riskScoreBps, decision} — leaves for DON
// consensus and RiskGuard settlement.
//
// Note what is and is not confidential here (per the confidential-workflows
// starter template): the workflow binary, including this logic, is provided to
// the enclave by the Workflow DON and is therefore revealed. What the enclave
// keeps confidential is the DATA: Vault DON secrets, the request/response
// payloads of HTTP calls made from the enclave, and intermediate values.
// Keep the scoring deterministic for a given input — the enclave result is
// attested and verified by DON consensus before the workflow completes.
const parseConfidential = (args: {
  thresholdRaw: string
  weightsRaw: string
  allowlistRaw: string
}): ConfidentialParams => {
  const thresholdBps = Number(args.thresholdRaw)
  if (!Number.isFinite(thresholdBps) || thresholdBps < 0 || thresholdBps > 10_000) {
    throw new Error(`invalid RISK_THRESHOLD_BPS secret: expected 0..10000, got ${typeof args.thresholdRaw}`)
  }
  let strategyWeights: ConfidentialParams['strategyWeights']
  try {
    const parsed = JSON.parse(args.weightsRaw) as Partial<ConfidentialParams['strategyWeights']>
    strategyWeights = {
      liquidity: Number(parsed.liquidity ?? 1),
      activity: Number(parsed.activity ?? 1),
      alpha: Number(parsed.alpha ?? 1),
    }
    if (Object.values(strategyWeights).some((v) => !Number.isFinite(v) || v < 0)) {
      throw new Error('weights must be non-negative numbers')
    }
  } catch (err) {
    throw new Error(`invalid STRATEGY_WEIGHTS secret: expected JSON {liquidity,activity,alpha}: ${(err as Error).message}`)
  }
  let operatorAllowlist: string[]
  try {
    const parsed = JSON.parse(args.allowlistRaw) as unknown
    if (!Array.isArray(parsed) || parsed.some((a) => typeof a !== 'string')) {
      throw new Error('expected JSON array of address strings')
    }
    operatorAllowlist = parsed
  } catch (err) {
    throw new Error(`invalid OPERATOR_ALLOWLIST secret: expected JSON string[]: ${(err as Error).message}`)
  }
  return { thresholdBps, strategyWeights, operatorAllowlist }
}

// ─── TEE HTTP Callback ──────────────────────────────────────
// Receives a `TeeRuntime`, not a `Runtime`. Everything here runs inside the
// enclave until we explicitly cross back with `usingTheDons()`.
/**
 * TEE HTTP handler: score pool risk in-enclave, best-effort POST the verdict,
 * then cross to the DON for a consensus-signed report.
 * @param runtime Attested TEE runtime (config + Vault DON secrets + logging).
 * @param payload Raw HTTP trigger payload carrying public pool inputs.
 * @returns Human-readable verdict summary ("ACT/SKIP @ <bps> for <poolId>").
 * @throws On invalid config URL, malformed public inputs, or invalid secrets.
 */
export const onHttpTrigger = (runtime: TeeRuntime<Config>, payload: HTTPPayload): string => {
  const config = runtime.config

  // Manual URL sanity check (see configSchema note: no z.string().url() in WASM).
  if (!/^https?:\/\//.test(config.aegisApiUrl)) {
    throw new Error(`invalid aegisApiUrl in workflow config: must start with http(s)://`)
  }

  // ── Public inputs: parsed + validated in-enclave (fail fast, no secrets touched).
  const publicInputs: PoolPublicInputs = publicInputSchema.parse(
    JSON.parse(new TextDecoder().decode(payload.input)),
  )

  // ── Step 2: Fetch secrets inside the enclave ──
  // The Vault DON releases these only into an attested enclave, decrypted at
  // the moment `getSecret()` runs. Nothing to declare upfront (unlike
  // Confidential HTTP's `vaultDonSecrets`). Three sensitive inputs, each
  // processed below without ever leaving the TEE.
  const thresholdRaw = runtime.getSecret({ id: config.thresholdSecretId }).result().value
  const weightsRaw = runtime.getSecret({ id: config.weightsSecretId }).result().value
  const allowlistRaw = runtime.getSecret({ id: config.allowlistSecretId }).result().value
  const apiKey = runtime.getSecret({ id: config.apiKeySecretId }).result().value
  const confidential = parseConfidential({ thresholdRaw, weightsRaw, allowlistRaw })

  // ── Enclave decision: varanasi heuristic over public intel + private params.
  const verdict = scorePoolRisk(publicInputs, confidential)

  // ── Step 3: Post the verdict to the varanasi agent API from the enclave ──
  // `HTTPClient.sendRequest()` has a `TeeRuntime` overload, so passing the TEE
  // runtime executes the request from inside the enclave — the API key in the
  // Authorization header stays confidential from node operators.
  // Note: do NOT reach for `ConfidentialHTTPClient` here — it has no
  // `TeeRuntime` overload and is not meant to be called from a TEE handler.
  // Best-effort: the signed DON report below is the source of truth for
  // RiskGuard; a down agent API must not fail the workflow.
  let posted = false
  try {
    const postResponse = new cre.capabilities.HTTPClient()
      .sendRequest(runtime, {
        url: `${config.aegisApiUrl.replace(/\/$/, '')}/v1/verdict`,
        method: 'POST',
        multiHeaders: {
          'Content-Type': { values: ['application/json'] },
          Authorization: { values: [`Bearer ${apiKey}`] },
        },
        body: new TextEncoder().encode(
          JSON.stringify({
            poolId: verdict.poolId,
            riskScoreBps: verdict.riskScoreBps,
            decision: verdict.decision,
          }),
        ),
      })
      .result()
    posted = ok(postResponse)
  } catch {
    posted = false
  }

  // ⚠️ Logs are for simulation only and MUST be removed before deploying to
  // production. Never log secrets, weights, the allowlist, or raw payloads —
  // only the non-sensitive verdict fields.
  runtime.log(
    `Enclave verdict complete. pool=${verdict.poolId} decision=${verdict.decision} score=${verdict.riskScoreBps}bps posted=${posted}`,
  )

  // ── Step 4: Cross back to the DON for consensus settlement ──
  // `usingTheDons()` returns a regular `Runtime`. Anything passed into a
  // capability call on it executes on Workflow DON nodes and is NO LONGER
  // confidential — so we cross over the verdict fields ONLY: never the
  // threshold, weights, allowlist, or API key. The DON attests the enclave
  // execution, reaches consensus, and signs this report for RiskGuard.
  const donRuntime = runtime.usingTheDons()

  const encodedPayload = encodeAbiParameters(
    parseAbiParameters('string poolId, uint256 riskScoreBps, string decision'),
    [verdict.poolId, BigInt(verdict.riskScoreBps), verdict.decision],
  )

  donRuntime
    .report({
      encodedPayload: hexToBase64(encodedPayload),
      encoderName: 'evm',
      signingAlgo: 'ecdsa',
      hashingAlgo: 'keccak256',
    })
    .result()

  // The signed report is now a normal CRE report consumable by RiskGuard
  // (Sepolia `authorize(action, riskScore)`). To deliver it on-chain, pass it
  // to `evmClient.writeReport(donRuntime, report)` — see the Keeper Bot or
  // Event Reactor templates for the full write path.
  return `${verdict.decision} @ ${verdict.riskScoreBps}bps for ${verdict.poolId} (agent API posted: ${posted})`
}

// ─── Workflow Init ──────────────────────────────────────────
/**
 * Register the confidential HTTP-trigger workflow handler.
 * @param config Validated non-sensitive wiring (API URL + secret IDs).
 * @returns Array with the single TEE-pinned HTTP handler (Nitro, us-west-2).
 */
export function initWorkflow(config: Config) {
  const httpTrigger = new cre.capabilities.HTTPCapability()

  return [
    // ── Step 1: Register a TEE handler ──
    // `cre.handlerInTee` instead of `cre.handler`. The third argument is a
    // `TeeConstraint` describing which enclaves this handler will accept.
    // `{}` accepts any registered TEE in any region; pin Nitro/us-west-2
    // (currently the only registered TEE type and region).
    cre.handlerInTee(httpTrigger.trigger({}), onHttpTrigger, [
      { tee: 'nitro', regions: ['us-west-2'] },
    ]),
  ]
}

// Re-exported for tests and the offline harness (see README "Simulation").
export { scorePoolRisk }
export type { PoolPublicInputs, RiskVerdict }
