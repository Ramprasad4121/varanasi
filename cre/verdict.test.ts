/**
 * @author Ramprasad
 * @module verdict.test — bun tests for the varanasi CRE verdict workflow + quorum.
 *
 * Purpose: cover pure `scoreDeliverable` verdicts (APPROVE/REJECT/roster/
 * weights), the deterministic `reportDigest`, `aggregateVerdicts` threshold
 * agreement, and the `onVerdictTrigger` TEE handler via a fake TeeRuntime
 * (auth-header injection, verdict-only POST body with matching reportHash,
 * DON report crossing, fail-fast validation, log hygiene).
 * Env deps: none (all secrets/config faked in-memory).
 */
import { describe, expect } from 'bun:test'
import type { HTTPPayload, TeeRuntime } from '@chainlink/cre-sdk'
import { test } from '@chainlink/cre-sdk/test'
import { initVerdictWorkflow, onVerdictTrigger, scoreDeliverable } from './verdict'
import { aggregateVerdicts, reportDigest, type QuorumReport } from './quorum'

// ─── Fixtures ───────────────────────────────────────────────
const QUALITY_BAR = '8000'
const RUBRIC_WEIGHTS = JSON.stringify({ completeness: 1, timeliness: 1, budget: 1 })
const NODE_ROSTER = JSON.stringify(['0xNode0000000000000000000000000000000000001'])
const API_KEY = 'test-aegis-key'

const SECRETS: Record<string, string> = {
  VERDICT_QUALITY_BAR_BPS: QUALITY_BAR,
  VERDICT_RUBRIC_WEIGHTS: RUBRIC_WEIGHTS,
  VERDICT_NODE_ROSTER: NODE_ROSTER,
  AEGIS_API_KEY: API_KEY,
}

const makeConfig = () => ({
  aegisApiUrl: 'http://127.0.0.1:9', // unroutable: POST path is best-effort
  requiredQuorum: 2,
  qualityBarSecretId: 'VERDICT_QUALITY_BAR_BPS',
  rubricWeightsSecretId: 'VERDICT_RUBRIC_WEIGHTS',
  nodeRosterSecretId: 'VERDICT_NODE_ROSTER',
  apiKeySecretId: 'AEGIS_API_KEY',
})

const encodePayload = (input: unknown): HTTPPayload =>
  ({ input: new TextEncoder().encode(JSON.stringify(input)) }) as HTTPPayload

// The public test surface does not yet ship a TEE runtime factory
// (`newTestRuntime` returns a DON `Runtime`), so we stand up the small slice of
// `TeeRuntime` the handler actually uses — same harness as workflow.test.ts.
type FakeOptions = { secrets?: Record<string, string> }

const makeFakeTeeRuntime = ({ secrets = SECRETS }: FakeOptions = {}) => {
  const capturedAuth: string[] = []
  const capturedBodies: string[] = []
  const reports: unknown[] = []
  const logs: string[] = []

  const runtime = {
    config: makeConfig(),
    getSecret: (request: { id?: string }) => ({
      result: () => ({ id: request.id, value: secrets[request.id ?? ''] ?? '' }),
    }),
    callCapability: ({
      payload,
    }: {
      payload: { multiHeaders?: Record<string, { values?: string[] }>; body?: Uint8Array }
    }) => {
      const auth = payload.multiHeaders?.Authorization
      capturedAuth.push(...(auth?.values ?? []))
      if (payload.body) capturedBodies.push(new TextDecoder().decode(payload.body))
      return { result: () => ({ statusCode: 200, body: new TextEncoder().encode('ok') }) }
    },
    log: (message: string) => logs.push(message),
    usingTheDons: () => ({
      report: (input: unknown) => {
        reports.push(input)
        return { result: () => ({}) }
      },
    }),
  }

  return {
    runtime: runtime as unknown as TeeRuntime<ReturnType<typeof makeConfig>>,
    capturedAuth,
    capturedBodies,
    reports,
    logs,
  }
}

const HEALTHY_INPUT = {
  taskId: '0x' + 'ab'.repeat(32),
  nodeId: '0xNode0000000000000000000000000000000000001',
  deliverableUri: 'ipfs://QmHealthyDeliverable',
  milestonesComplete: 4,
  milestonesTotal: 4,
  onTime: true,
  collateralAligned: true,
}

const BAR = { qualityBarBps: 8000, nodeRoster: [] as string[] }
const MID = { ...HEALTHY_INPUT, milestonesComplete: 2 } // 8000 @ neutral weights
const RUSHED = { ...HEALTHY_INPUT, milestonesComplete: 1, onTime: false, collateralAligned: false }

describe('scoreDeliverable (pure enclave logic)', () => {
  test('APPROVEs a complete, on-time, aligned deliverable against a permissive bar', () => {
    const v = scoreDeliverable(HEALTHY_INPUT, {
      ...BAR,
      rubricWeights: { completeness: 1, timeliness: 1, budget: 1 },
    })
    expect(v.decision).toBe('APPROVE')
    expect(v.scoreBps).toBe(10_000) // 5000 base + 4000 + 800 + 200
  })

  test('REJECTs an incomplete, late, misaligned deliverable', () => {
    const v = scoreDeliverable(RUSHED, {
      ...BAR,
      rubricWeights: { completeness: 1, timeliness: 1, budget: 1 },
    })
    expect(v.decision).toBe('REJECT')
    expect(v.scoreBps).toBe(6000) // 5000 + 1000 + 0 + 0, below the 8000 bar
  })

  test('confidential rubric weights move the score without touching public inputs', () => {
    const neutral = scoreDeliverable(MID, {
      ...BAR,
      rubricWeights: { completeness: 1, timeliness: 1, budget: 1 },
    })
    const strict = scoreDeliverable(MID, {
      ...BAR,
      rubricWeights: { completeness: 2, timeliness: 1, budget: 1 },
    })
    expect(strict.scoreBps).toBeGreaterThan(neutral.scoreBps)
  })

  test('hard-blocks nodes missing from the confidential roster', () => {
    const v = scoreDeliverable(
      { ...HEALTHY_INPUT, nodeId: '0xIntruderNode0000000000000000000000000001' },
      {
        qualityBarBps: 8000,
        rubricWeights: { completeness: 1, timeliness: 1, budget: 1 },
        nodeRoster: ['0xNode0000000000000000000000000000000000001'],
      },
    )
    expect(v.decision).toBe('REJECT')
    expect(v.scoreBps).toBe(0)
  })
})

describe('reportDigest / encodeVerdictReport', () => {
  const REPORT: QuorumReport = {
    taskId: HEALTHY_INPUT.taskId,
    nodeId: HEALTHY_INPUT.nodeId,
    scoreBps: 10_000,
    decision: 'APPROVE',
  }

  test('is a deterministic 32-byte hex digest', () => {
    const d1 = reportDigest(REPORT)
    const d2 = reportDigest(REPORT)
    expect(d1).toBe(d2)
    expect(d1).toMatch(/^0x[0-9a-f]{64}$/)
  })

  test('changes when a signed field changes, is casing-stable for nodeId', () => {
    const mut = reportDigest({ ...REPORT, scoreBps: 8000 })
    expect(mut).not.toBe(reportDigest(REPORT))
    expect(reportDigest({ ...REPORT, nodeId: REPORT.nodeId.toUpperCase() })).toBe(
      reportDigest(REPORT),
    )
  })
})

describe('aggregateVerdicts (off-chain quorum bookkeeping)', () => {
  const NODE_A = { taskId: HEALTHY_INPUT.taskId, nodeId: '0xa', scoreBps: 10_000, decision: 'APPROVE' }
  const NODE_B = { taskId: HEALTHY_INPUT.taskId, nodeId: '0xb', scoreBps: 8500, decision: 'APPROVE' }
  const NODE_C = { taskId: HEALTHY_INPUT.taskId, nodeId: '0xc', scoreBps: 6000, decision: 'REJECT' }

  test('RELEASEs when agreeCount meets requiredQuorum', () => {
    const s = aggregateVerdicts([NODE_A, NODE_B, NODE_C], {
      requiredQuorum: 2,
      qualityBarBps: 8000,
    })
    expect(s.met).toBe(true)
    expect(s.decision).toBe('RELEASE')
    expect(s.agreeCount).toBe(2)
    expect(s.nodeCount).toBe(3)
  })

  test('HOLDs when agreement falls below requiredQuorum', () => {
    const s = aggregateVerdicts([NODE_A, NODE_B, NODE_C], {
      requiredQuorum: 3,
      qualityBarBps: 8000,
    })
    expect(s.met).toBe(false)
    expect(s.decision).toBe('HOLD')
  })

  test('counts a node only once — re-votes overwrite the slot', () => {
    const s = aggregateVerdicts(
      [NODE_C, { ...NODE_C, scoreBps: 10_000, decision: 'APPROVE' as const }, NODE_B],
      { requiredQuorum: 2, qualityBarBps: 8000 },
    )
    // nodeId '0xc' voted REJECT then APPROVE (last write wins) → 2 agreeing nodes.
    expect(s.nodeCount).toBe(2)
    expect(s.agreeCount).toBe(2)
    expect(s.decision).toBe('RELEASE')
  })

  test('HOLDs past the on-chain node cap (MAX_QUORUM_NODES)', () => {
    const many = Array.from({ length: 22 }, (_, i) => ({
      taskId: HEALTHY_INPUT.taskId,
      nodeId: `0x${i.toString(16)}`,
      scoreBps: 10_000,
      decision: 'APPROVE' as const,
    }))
    const s = aggregateVerdicts(many, { requiredQuorum: 2, qualityBarBps: 8000 })
    expect(s.agreeCount).toBe(22)
    expect(s.met).toBe(false) // nodeCount 22 > MAX_QUORUM_NODES → contract reverts
    expect(s.decision).toBe('HOLD')
  })
})

describe('onVerdictTrigger (TEE handler)', () => {
  test('injects the enclave-fetched API key into the agent-API POST', () => {
    const { runtime, capturedAuth } = makeFakeTeeRuntime()
    onVerdictTrigger(runtime, encodePayload(HEALTHY_INPUT))
    expect(capturedAuth).toEqual([`Bearer ${API_KEY}`])
  })

  test('POST body carries only the verdict fields + reportHash, never the secrets', () => {
    const { runtime, capturedBodies } = makeFakeTeeRuntime()
    onVerdictTrigger(runtime, encodePayload(HEALTHY_INPUT))
    expect(capturedBodies).toHaveLength(1)
    const body = JSON.parse(capturedBodies[0]) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual([
      'decision',
      'nodeId',
      'reportHash',
      'scoreBps',
      'taskId',
    ])
    const verdict: QuorumReport = {
      taskId: body.taskId as string,
      nodeId: body.nodeId as string,
      scoreBps: body.scoreBps as number,
      decision: body.decision as 'APPROVE' | 'REJECT',
    }
    expect(body.reportHash).toBe(reportDigest(verdict))
    const raw = JSON.stringify(body)
    expect(raw).not.toContain(RUBRIC_WEIGHTS)
    expect(raw).not.toContain(API_KEY)
    expect(raw).not.toContain(NODE_ROSTER)
  })

  test('returns APPROVE for the healthy deliverable and crosses to the DON', () => {
    const { runtime, reports } = makeFakeTeeRuntime()
    const result = onVerdictTrigger(runtime, encodePayload(HEALTHY_INPUT))
    expect(result).toContain('APPROVE')
    expect(result).toContain(HEALTHY_INPUT.taskId)
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      encoderName: 'evm',
      signingAlgo: 'ecdsa',
      hashingAlgo: 'keccak256',
    })
  })

  test('REJECTs + still reports when the confidential quality bar is strict', () => {
    const { runtime, reports } = makeFakeTeeRuntime({
      secrets: { ...SECRETS, VERDICT_QUALITY_BAR_BPS: '9999' },
    })
    const result = onVerdictTrigger(runtime, encodePayload(MID))
    expect(result).toContain('REJECT')
    expect(reports).toHaveLength(1)
  })

  test('rejects malformed public inputs before reaching the DON', () => {
    const { runtime, reports } = makeFakeTeeRuntime()
    expect(() =>
      onVerdictTrigger(
        runtime,
        encodePayload({ ...HEALTHY_INPUT, taskId: '', milestonesTotal: 0 }),
      ),
    ).toThrow()
    expect(reports).toHaveLength(0)
  })

  test('never logs secrets, weights, roster, or raw payloads', () => {
    const { runtime, logs } = makeFakeTeeRuntime()
    onVerdictTrigger(runtime, encodePayload(HEALTHY_INPUT))
    for (const line of logs) {
      expect(line).not.toContain(API_KEY)
      expect(line).not.toContain(RUBRIC_WEIGHTS)
      expect(line).not.toContain(NODE_ROSTER)
      expect(line).not.toContain('0xNode0000000000000000000000000000000000001')
    }
  })
})

describe('initVerdictWorkflow', () => {
  test('registers the HTTP handler with a Nitro TEE constraint', () => {
    const handlers = initVerdictWorkflow(makeConfig())
    expect(handlers).toHaveLength(1)
    expect(handlers[0].fn).toBe(onVerdictTrigger)
    // handlerInTee attaches TEE requirements; cre.handler does not.
    expect(handlers[0].requirements).toBeDefined()
  })
})