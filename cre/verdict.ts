/**
 * @author Ramprasad
 * @module verdict — CRE confidential verdict-network workflow: TEE HTTP handler + DON report.
 *
 * Purpose: validate public task-deliverable evidence in-enclave, apply the
 * confidential quality bar + rubric weights + node roster (Vault DON secrets)
 * via scoreDeliverable, best-effort POST the node verdict to the varanasi
 * agent API (which relays submitNodeVerdict on-chain), and cross to the
 * Workflow DON for a consensus-signed report whose digest the contract pins
 * as `reportHash`.
 *
 * On-chain counterpart: MandateTreeEscrow.submitNodeVerdict — each verdict
 * NODE is an independent operator running this workflow; the contract freezes
 * VerdictMode.Quorum + requiredQuorum at the first vote, then counts
 * threshold agreement (scoreBps >= pinnedThresholdBps) toward release. The
 * `reportDigest` exported by ./quorum.ts must equal the reportHash the relay
 * submits so a report cannot be replayed against another task.
 *
 * Env deps: none read directly (non-sensitive wiring arrives via validated
 * `verdictConfigSchema`; secrets via `runtime.getSecret` from the Vault DON).
 */
import {
  cre,
  hexToBase64,
  ok,
  type HTTPPayload,
  type TeeRuntime,
} from '@chainlink/cre-sdk'
import { z } from 'zod'
import { encodeVerdictReport, MAX_QUORUM_NODES, reportDigest } from './quorum'

// ─── Config Schema ──────────────────────────────────────────
// Non-sensitive wiring only (the shared aegisApiUrl is declared once in
// ./workflow.ts's pool schema; main.ts merges the two schemas for the runner).
export const verdictConfigSchema = z.object({
  // Independent verdict nodes needed for on-chain release. MUST match the
  // contract's `defaultQuorum` (frozen per node at its first vote).
  requiredQuorum: z.number().int().min(1).max(MAX_QUORUM_NODES).default(3),
  qualityBarSecretId: z.string().default('VERDICT_QUALITY_BAR_BPS'),
  rubricWeightsSecretId: z.string().default('VERDICT_RUBRIC_WEIGHTS'),
  nodeRosterSecretId: z.string().default('VERDICT_NODE_ROSTER'),
  apiKeySecretId: z.string().default('AEGIS_API_KEY'),
})
// The merged runner config supplies aegisApiUrl (declared in the pool schema).
export type VerdictConfig = z.infer<typeof verdictConfigSchema> & { aegisApiUrl: string }

// ─── Public trigger input ───────────────────────────────────
// Sent in the clear with every HTTP trigger request. Zod-validated inside the
// enclave so malformed payloads fail fast before touching any secret.
const publicInputSchema = z.object({
  taskId: z.string().min(1), // bytes32 hex on-chain node id
  nodeId: z.string().min(1), // this verdict node's reporter address (on-chain msg.sender)
  deliverableUri: z.string().min(1), // public evidence reference
  milestonesComplete: z.coerce.number().int().min(0),
  milestonesTotal: z.coerce.number().int().min(1).max(1000),
  onTime: z.boolean(),
  collateralAligned: z.boolean(),
})

// ─── Logic over confidential data ───────────────────────────
// `scoreDeliverable` (below) runs ENTIRELY inside the enclave: the private
// quality bar, rubric weights, and node roster are inputs to the computation
// and none of them cross `usingTheDons()`. Only the verdict —
// {taskId, nodeId, scoreBps, decision} — leaves for DON consensus, and the
// relay submits reportDigest(verdict) to MandateTreeEscrow.submitNodeVerdict.
const parseConfidential = (args: {
  qualityBarRaw: string
  weightsRaw: string
  rosterRaw: string
}): VerdictConfidentialParams => {
  const qualityBarBps = Number(args.qualityBarRaw)
  if (!Number.isFinite(qualityBarBps) || qualityBarBps < 0 || qualityBarBps > 10_000) {
    throw new Error(
      `invalid VERDICT_QUALITY_BAR_BPS secret: expected 0..10000, got ${typeof args.qualityBarRaw}`,
    )
  }
  let rubricWeights: VerdictConfidentialParams['rubricWeights']
  try {
    const parsed = JSON.parse(args.weightsRaw) as Partial<VerdictConfidentialParams['rubricWeights']>
    rubricWeights = {
      completeness: Number(parsed.completeness ?? 1),
      timeliness: Number(parsed.timeliness ?? 1),
      budget: Number(parsed.budget ?? 1),
    }
    if (Object.values(rubricWeights).some((v) => !Number.isFinite(v) || v < 0)) {
      throw new Error('weights must be non-negative numbers')
    }
  } catch (err) {
    throw new Error(
      `invalid VERDICT_RUBRIC_WEIGHTS secret: expected JSON {completeness,timeliness,budget}: ${(err as Error).message}`,
    )
  }
  let nodeRoster: string[]
  try {
    const parsed = JSON.parse(args.rosterRaw) as unknown
    if (!Array.isArray(parsed) || parsed.some((a) => typeof a !== 'string')) {
      throw new Error('expected JSON array of address strings')
    }
    nodeRoster = parsed
  } catch (err) {
    throw new Error(
      `invalid VERDICT_NODE_ROSTER secret: expected JSON string[]: ${(err as Error).message}`,
    )
  }
  return { qualityBarBps, rubricWeights, nodeRoster }
}

// ─── TEE HTTP Callback ──────────────────────────────────────
// Receives a `TeeRuntime`, not a `Runtime`. Everything runs inside the
// enclave until we explicitly cross back with `usingTheDons()`.
/**
 * TEE HTTP handler: score a task deliverable in-enclave against the
 * confidential rubric, best-effort POST the node verdict, then cross to the
 * DON for a consensus-signed report.
 * @param runtime Attested TEE runtime (config + Vault DON secrets + logging).
 * @param payload Raw HTTP trigger payload carrying public deliverable evidence.
 * @returns Human-readable verdict summary ("APPROVE/REJECT @ <bps> for <taskId>").
 * @throws On invalid config URL, malformed public inputs, or invalid secrets.
 */
export const onVerdictTrigger = (
  runtime: TeeRuntime<VerdictConfig>,
  payload: HTTPPayload,
): string => {
  const config = runtime.config

  // Manual URL sanity check (see workflow.ts configSchema note: zod's .url()
  // fails in the CRE WASM sandbox where the WHATWG URL global is absent).
  if (!/^https?:\/\//.test(config.aegisApiUrl)) {
    throw new Error(`invalid aegisApiUrl in workflow config: must start with http(s)://`)
  }

  // ── Public inputs: parsed + validated in-enclave (fail fast, no secrets touched).
  const publicInputs: DeliverablePublicInputs = publicInputSchema.parse(
    JSON.parse(new TextDecoder().decode(payload.input)),
  )

  // ── Fetch secrets inside the enclave ── (confidential until this moment).
  const qualityBarRaw = runtime.getSecret({ id: config.qualityBarSecretId }).result().value
  const weightsRaw = runtime.getSecret({ id: config.rubricWeightsSecretId }).result().value
  const rosterRaw = runtime.getSecret({ id: config.nodeRosterSecretId }).result().value
  const apiKey = runtime.getSecret({ id: config.apiKeySecretId }).result().value
  const confidential = parseConfidential({ qualityBarRaw, weightsRaw, rosterRaw })

  // ── Enclave decision: deterministic rubric over public evidence + private params.
  const verdict = scoreDeliverable(publicInputs, confidential)

  // ── Best-effort POST to the agent API (relays submitNodeVerdict on-chain) ──
  // `HTTPClient.sendRequest()` has a `TeeRuntime` overload, so the request
  // executes from inside the enclave — the Authorization header stays
  // confidential from node operators. The signed DON report + reportHash are
  // the settlement inputs for MandateTreeEscrow, so a down API must not fail
  // the workflow.
  let posted = false
  try {
    const postResponse = new cre.capabilities.HTTPClient()
      .sendRequest(runtime, {
        url: `${config.aegisApiUrl.replace(/\/$/, '')}/v1/verdicts`,
        method: 'POST',
        multiHeaders: {
          'Content-Type': { values: ['application/json'] },
          Authorization: { values: [`Bearer ${apiKey}`] },
        },
        body: new TextEncoder().encode(
          JSON.stringify({
            taskId: verdict.taskId,
            nodeId: verdict.nodeId,
            scoreBps: verdict.scoreBps,
            decision: verdict.decision,
            reportHash: reportDigest(verdict),
          }),
        ),
      })
      .result()
    posted = ok(postResponse)
  } catch {
    posted = false
  }

  // ⚠️ Logs are for simulation only and MUST be removed before deploying.
  // Never log secrets, weights, the roster, or raw payloads — only the
  // non-sensitive verdict fields.
  runtime.log(
    `Node verdict complete. task=${verdict.taskId} decision=${verdict.decision} score=${verdict.scoreBps}bps posted=${posted}`,
  )

  // ── Cross back to the DON for consensus settlement ──
  // The DON attests the enclave execution and signs the report; the relay
  // derives `reportHash` with reportDigest (./quorum.ts) and calls
  // MandateTreeEscrow.submitNodeVerdict(taskId, scoreBps, reportHash).
  const donRuntime = runtime.usingTheDons()

  const encodedPayload = encodeVerdictReport(verdict)

  donRuntime
    .report({
      encodedPayload: hexToBase64(encodedPayload),
      encoderName: 'evm',
      signingAlgo: 'ecdsa',
      hashingAlgo: 'keccak256',
    })
    .result()

  return `${verdict.decision} @ ${verdict.scoreBps}bps for ${verdict.taskId} (agent API posted: ${posted})`
}

// ─── Workflow Init ──────────────────────────────────────────
/**
 * Register the confidential HTTP-trigger verdict workflow handler.
 * @param config Merged runner config (URL + verdict secret IDs).
 * @returns Array with the single TEE-pinned HTTP handler (Nitro, us-west-2).
 */
export function initVerdictWorkflow(config: VerdictConfig) {
  const httpTrigger = new cre.capabilities.HTTPCapability()

  return [
    cre.handlerInTee(httpTrigger.trigger({}), onVerdictTrigger, [
      { tee: 'nitro', regions: ['us-west-2'] },
    ]),
  ]
}

// ─── Pure scoring (unit-testable outside CRE / WASM) ────────

export interface DeliverablePublicInputs {
  taskId: string
  nodeId: string
  deliverableUri: string
  milestonesComplete: number
  milestonesTotal: number
  onTime: boolean
  collateralAligned: boolean
}

export interface VerdictConfidentialParams {
  /** Private APPROVE bar in bps (high = good); mirrors contract `pinnedThresholdBps`. */
  qualityBarBps: number
  /** Private per-factor multipliers; lets the operator tune rubric sensitivity unseen. */
  rubricWeights: {
    completeness: number
    timeliness: number
    budget: number
  }
  /** Private roster of authorized verdict nodes; membership is checked in-enclave. */
  nodeRoster: string[]
}

export interface NodeVerdict {
  taskId: string
  nodeId: string
  scoreBps: number
  decision: 'APPROVE' | 'REJECT'
  factors: { name: string; bps: number; note: string }[]
}

export const DEFAULT_RUBRIC_WEIGHTS: VerdictConfidentialParams['rubricWeights'] = {
  completeness: 1,
  timeliness: 1,
  budget: 1,
}

/** ABIParams for the DON report — canonical form lives in ./quorum.ts. */
export { VERDICT_REPORT_ABI } from './quorum'

/**
 * Deterministic rubric: 5000 (base) + up to 5000 from {completeness, timeliness,
 * budget}, scaled by the confidential per-factor weight and clamped to [0, 10_000].
 * High = good — agree threshold is `scoreBps >= qualityBarBps` (matching the
 * on-chain contract: `rec.scoreBps >= pinnedThresholdBps`).
 */
export function scoreDeliverable(
  input: DeliverablePublicInputs,
  confidential: VerdictConfidentialParams,
): NodeVerdict {
  const w = { ...DEFAULT_RUBRIC_WEIGHTS, ...confidential.rubricWeights }
  const factors: NodeVerdict['factors'] = []

  // ── Node roster gate inside the enclave ── (contract allows reporters on
  // the chain side, but the confidential roster lets us gate without revealing
  // the list to node operators).
  if (confidential.nodeRoster.length > 0) {
    const listed = confidential.nodeRoster.some(
      (a) => a.toLowerCase() === input.nodeId.toLowerCase(),
    )
    if (!listed) {
      factors.push({
        name: 'node-roster',
        bps: 0,
        note: 'node not on confidential verdict roster — hard block',
      })
      return finish(input, 0, factors, confidential.qualityBarBps)
    }
    factors.push({ name: 'node-roster', bps: 0, note: 'node on confidential verdict roster' })
  }

  const complete =
    input.milestonesTotal > 0
      ? Math.min(1, input.milestonesComplete / input.milestonesTotal)
      : 0

  let score = 5000 // baseline: a funded deliverable under evaluation

  // Completeness: 0..1 × 4000 × weight — full delivery caps the balance headroom.
  const completenessBps = Math.round(complete * 4000 * w.completeness)
  score += completenessBps
  factors.push({
    name: 'completeness',
    bps: completenessBps,
    note: `${input.milestonesComplete}/${input.milestonesTotal} milestones`,
  })

  // Timeliness: 0 or up to 800 bps.
  const timelinessBps = input.onTime ? Math.round(800 * w.timeliness) : 0
  score += timelinessBps
  factors.push({
    name: 'timeliness',
    bps: timelinessBps,
    note: input.onTime ? 'delivered on schedule' : 'delivered late',
  })

  // Budget alignment: 0 or up to 200 bps.
  const budgetBps = input.collateralAligned ? Math.round(200 * w.budget) : 0
  score += budgetBps
  factors.push({
    name: 'budget-alignment',
    bps: budgetBps,
    note: input.collateralAligned ? 'expenditure within escrowed cap' : 'cap overrun risk',
  })

  return finish(input, score, factors, confidential.qualityBarBps)
}

function finish(
  input: DeliverablePublicInputs,
  score: number,
  factors: NodeVerdict['factors'],
  qualityBarBps: number,
): NodeVerdict {
  const scoreBps = Math.min(10_000, Math.max(0, Math.round(score)))
  const decision = scoreBps >= qualityBarBps ? 'APPROVE' : 'REJECT'
  return { taskId: input.taskId, nodeId: input.nodeId, scoreBps, decision, factors }
}

// Re-exported for tests and the offline harness.
export { reportDigest }
export type { QuorumReport } from './quorum'