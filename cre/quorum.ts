/**
 * @author Ramprasad
 * @module quorum — pure threshold-agreement aggregation for the verdict network.
 *
 * Mirrors MandateTreeEscrow's quorum accounting OFF-chain so node operators /
 * the relay can compute the same summary the contract will reach, and owns the
 * ONLY canonical report encoding shared by everyone:
 *
 *   - approve  = scoreBps >= qualityBarBps            (contract: rec.scoreBps >= pinnedThresholdBps)
 *   - release iff agreeCount >= requiredQuorum, with nodeCount <= MAX_QUORUM_NODES
 *   - reportDigest() = keccak256 of the exact EVM ABI payload the DON signs;
 *     the relay passes this as MandateTreeEscrow.submitNodeVerdict's reportHash,
 *     binding an on-chain vote to the attested CRE report.
 *
 * No CRE SDK imports: unit-testable anywhere (bun test, node, vitest).
 */
import { encodeAbiParameters, keccak256, parseAbiParameters, type Hex } from 'viem'

/** Contract cap (MandateTreeEscrow.MAX_QUORUM_NODES). */
export const MAX_QUORUM_NODES = 21

/**
 * Single canonical ABI for the DON report: (taskId, nodeId, scoreBps, decision).
 * Used by the TEE handler (report crossing), the digest (reportHash), and the
 * offline relay (submitNodeVerdict arguments).
 */
export const VERDICT_REPORT_ABI = parseAbiParameters(
  'string taskId, string nodeId, uint256 scoreBps, string decision',
)

export interface QuorumReport {
  taskId: string
  nodeId: string
  scoreBps: number
  decision: 'APPROVE' | 'REJECT'
}

export interface AggregateParams {
  /** Independent nodes that must agree to release; contract's `defaultQuorum`. */
  requiredQuorum: number
  /** Private quality bar (bps, high = good); contract's `pinnedThresholdBps`. */
  qualityBarBps: number
}

export interface QuorumSummary {
  taskId: string
  agreeCount: number
  nodeCount: number
  requiredQuorum: number
  qualityBarBps: number
  met: boolean
  decision: 'RELEASE' | 'HOLD'
  reports: QuorumReport[]
}

/** The exact ABI bytes (EVM encoder, keccak256) placed in the DON report. */
export function encodeVerdictReport(report: QuorumReport): Hex {
  const nodeId = report.nodeId.toLowerCase()
  return encodeAbiParameters(VERDICT_REPORT_ABI, [
    report.taskId,
    nodeId,
    BigInt(report.scoreBps),
    report.decision,
  ])
}

/**
 * Digest the relay submits to MandateTreeEscrow.submitNodeVerdict as
 * `reportHash`. Deterministic per (taskId, nodeId, scoreBps, decision) so a
 * report cannot be replayed against a different task or with different scores.
 */
export function reportDigest(report: QuorumReport): string {
  return keccak256(encodeVerdictReport(report))
}

/**
 * OFF-chain quorum bookkeeping — same counting the contract applies on-chain:
 * one record per node (last write wins, mirroring re-votes), agreement counted
 * against the quality bar, release when the bar is reached within the node cap.
 * @returns Summary with a RELEASE/HOLD verdict for the relay / dashboard.
 */
export function aggregateVerdicts(
  reports: QuorumReport[],
  params: AggregateParams,
): QuorumSummary {
  // One record per node; last write wins (on-chain `verdicts[taskId][reporter]`).
  const byNode = new Map<string, QuorumReport>()
  for (const r of reports) {
    byNode.set(r.nodeId.toLowerCase(), r)
  }
  const deduped = [...byNode.values()]

  const agreeCount = deduped.filter((r) => r.scoreBps >= params.qualityBarBps).length
  const met = agreeCount >= params.requiredQuorum && deduped.length <= MAX_QUORUM_NODES

  const taskId = deduped[0]?.taskId ?? reports[0]?.taskId ?? ''
  return {
    taskId,
    agreeCount,
    nodeCount: deduped.length,
    requiredQuorum: params.requiredQuorum,
    qualityBarBps: params.qualityBarBps,
    met,
    decision: met ? 'RELEASE' : 'HOLD',
    reports: deduped,
  }
}