/**
 * @author Ramprasad
 * @module main — CRE runner bootstrap for the varanasi confidential workflows.
 *
 * Purpose: create the CRE Runner with the merged config schema and register
 * BOTH confidential workflows:
 *   1. pool-risk   (./workflow.ts)  — ACT/SKIP on Uniswap pools
 *   2. verdict     (./verdict.ts)   — APPROVE/REJECT node verdicts feeding the
 *      MandateTreeEscrow quorum (submitNodeVerdict)
 * The merged schema carries the union of both workflows' non-sensitive wiring;
 * each handler reads only its own fields at runtime.
 * Env deps: none read directly (config/secrets resolved by the CRE runtime).
 */
import { Runner } from '@chainlink/cre-sdk'
import { configSchema as poolConfigSchema, initWorkflow } from './workflow'
import { verdictConfigSchema, initVerdictWorkflow } from './verdict'

/** Merged, non-sensitive wiring for every registered workflow. */
export const configSchema = poolConfigSchema.merge(verdictConfigSchema)

/**
 * Boot the CRE runner and register both confidential workflows.
 * @returns Resolves when the runner has been started (runner runs until stopped).
 */
export async function main() {
  const runner = await Runner.newRunner({ configSchema })
  await runner.run(initWorkflow)
  await runner.run(initVerdictWorkflow)
}

main()