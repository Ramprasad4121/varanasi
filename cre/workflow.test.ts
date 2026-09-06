import { describe, expect } from 'bun:test'
import type { HTTPPayload, TeeRuntime } from '@chainlink/cre-sdk'
import { test } from '@chainlink/cre-sdk/test'
import { initWorkflow, onHttpTrigger } from './workflow'
import { scorePoolRisk } from './risk'

// ─── Fixtures ───────────────────────────────────────────────
const THRESHOLD = '5000'
const WEIGHTS = JSON.stringify({ liquidity: 1, activity: 1, alpha: 1 })
const ALLOWLIST = JSON.stringify(['0xAgent000000000000000000000000000000000001'])
const API_KEY = 'test-aegis-key'

const SECRETS: Record<string, string> = {
  RISK_THRESHOLD_BPS: THRESHOLD,
  STRATEGY_WEIGHTS: WEIGHTS,
  OPERATOR_ALLOWLIST: ALLOWLIST,
  AEGIS_API_KEY: API_KEY,
}

const makeConfig = () => ({
  aegisApiUrl: 'http://127.0.0.1:9', // unroutable: POST path is best-effort
  thresholdSecretId: 'RISK_THRESHOLD_BPS',
  weightsSecretId: 'STRATEGY_WEIGHTS',
  allowlistSecretId: 'OPERATOR_ALLOWLIST',
  apiKeySecretId: 'AEGIS_API_KEY',
})

const encodePayload = (input: unknown): HTTPPayload =>
  ({ input: new TextEncoder().encode(JSON.stringify(input)) }) as HTTPPayload

// The public test surface does not yet ship a TEE runtime factory
// (`newTestRuntime` returns a DON `Runtime`), so we stand up the small slice of
// `TeeRuntime` the handler actually uses: config, getSecret, callCapability
// (which HTTPClient.sendRequest goes through), log, and usingTheDons.
// Mirrors the hello-confidential-workflows-ts template test harness.
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

const HEALTHY_POOL = {
  poolId: 'USDC/ETH-0.3%',
  tvlUsd: 5_000_000,
  volume24hUsd: 1_000_000,
  alphaScore: 0.6,
  operator: '0xAgent000000000000000000000000000000000001',
}

describe('scorePoolRisk (pure enclave logic)', () => {
  test('ACTs on a deep, active pool with bullish alpha', () => {
    const v = scorePoolRisk(HEALTHY_POOL, {
      thresholdBps: 5000,
      strategyWeights: { liquidity: 1, activity: 1, alpha: 1 },
      operatorAllowlist: [],
    })
    expect(v.decision).toBe('ACT')
    expect(v.riskScoreBps).toBeLessThanOrEqual(5000)
  })

  test('SKIPs a thin, stale, bearish pool', () => {
    const v = scorePoolRisk(
      { poolId: 'XYZ/ETH', tvlUsd: 50_000, volume24hUsd: 100, alphaScore: -0.9 },
      {
        thresholdBps: 5000,
        strategyWeights: { liquidity: 1, activity: 1, alpha: 1 },
        operatorAllowlist: [],
      },
    )
    expect(v.decision).toBe('SKIP')
    expect(v.riskScoreBps).toBeGreaterThan(5000)
  })

  test('hard-blocks operators missing from the confidential allowlist', () => {
    const v = scorePoolRisk(
      { ...HEALTHY_POOL, operator: '0xIntruder00000000000000000000000000000002' },
      {
        thresholdBps: 5000,
        strategyWeights: { liquidity: 1, activity: 1, alpha: 1 },
        operatorAllowlist: ['0xAgent000000000000000000000000000000000001'],
      },
    )
    expect(v.decision).toBe('SKIP')
    expect(v.riskScoreBps).toBe(10_000)
  })

  test('confidential weights move the verdict without touching public inputs', () => {
    const base = { thresholdBps: 5000, operatorAllowlist: [] as string[] }
    const pool = { poolId: 'MID/ETH', tvlUsd: 500_000, volume24hUsd: 20_000, alphaScore: 0 }
    const neutral = scorePoolRisk(pool, {
      ...base,
      strategyWeights: { liquidity: 1, activity: 1, alpha: 1 },
    })
    const strict = scorePoolRisk(pool, {
      ...base,
      strategyWeights: { liquidity: 4, activity: 4, alpha: 1 },
    })
    expect(strict.riskScoreBps).toBeGreaterThan(neutral.riskScoreBps)
  })
})

describe('onHttpTrigger (TEE handler)', () => {
  test('injects the enclave-fetched API key into the agent-API POST', () => {
    const { runtime, capturedAuth } = makeFakeTeeRuntime()
    onHttpTrigger(runtime, encodePayload(HEALTHY_POOL))
    expect(capturedAuth).toEqual([`Bearer ${API_KEY}`])
  })

  test('POST body carries only the verdict triple, never the secrets', () => {
    const { runtime, capturedBodies } = makeFakeTeeRuntime()
    onHttpTrigger(runtime, encodePayload(HEALTHY_POOL))
    expect(capturedBodies).toHaveLength(1)
    const body = JSON.parse(capturedBodies[0]) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['decision', 'poolId', 'riskScoreBps'])
    expect(JSON.stringify(body)).not.toContain(THRESHOLD)
    expect(JSON.stringify(body)).not.toContain(API_KEY)
  })

  test('returns ACT for the healthy pool and crosses to the DON with a report', () => {
    const { runtime, reports } = makeFakeTeeRuntime()
    const result = onHttpTrigger(runtime, encodePayload(HEALTHY_POOL))
    expect(result).toContain('ACT')
    expect(result).toContain('USDC/ETH-0.3%')
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      encoderName: 'evm',
      signingAlgo: 'ecdsa',
      hashingAlgo: 'keccak256',
    })
  })

  test('SKIPs + still reports when the confidential threshold is strict', () => {
    const { runtime, reports } = makeFakeTeeRuntime({
      secrets: { ...SECRETS, RISK_THRESHOLD_BPS: '100' },
    })
    // Mid-risk pool scores ~2000bps (thin-liquidity + modest flow), above the
    // strict 100bps private threshold — while the same input ACTs at 5000.
    const midPool = { poolId: 'MID/ETH', tvlUsd: 500_000, volume24hUsd: 20_000, alphaScore: 0 }
    const result = onHttpTrigger(runtime, encodePayload(midPool))
    expect(result).toContain('SKIP')
    expect(reports).toHaveLength(1)
  })

  test('rejects malformed public inputs before reaching the DON', () => {
    const { runtime, reports } = makeFakeTeeRuntime()
    expect(() => onHttpTrigger(runtime, encodePayload({ poolId: '', tvlUsd: -5 }))).toThrow()
    expect(reports).toHaveLength(0)
  })

  test('never logs secrets, weights, allowlist, or raw payloads', () => {
    const { runtime, logs } = makeFakeTeeRuntime()
    onHttpTrigger(runtime, encodePayload(HEALTHY_POOL))
    for (const line of logs) {
      expect(line).not.toContain(API_KEY)
      expect(line).not.toContain(WEIGHTS)
      expect(line).not.toContain(ALLOWLIST)
      expect(line).not.toContain('0xAgent000000000000000000000000000000000001')
    }
  })
})

describe('initWorkflow', () => {
  test('registers the HTTP handler with a Nitro TEE constraint', () => {
    const handlers = initWorkflow(makeConfig())
    expect(handlers).toHaveLength(1)
    expect(handlers[0].fn).toBe(onHttpTrigger)
    // handlerInTee attaches TEE requirements; cre.handler does not.
    expect(handlers[0].requirements).toBeDefined()
  })
})
