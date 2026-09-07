/**
 * @author Ramprasad
 * @module main — CRE runner bootstrap for the varanasi confidential risk workflow.
 *
 * Purpose: create the CRE Runner with `configSchema` and run `initWorkflow`.
 * Env deps: none read directly (config/secrets resolved by the CRE runtime).
 */
import { Runner } from '@chainlink/cre-sdk'
import { configSchema, initWorkflow } from './workflow'

/**
 * Boot the CRE runner and register the confidential risk workflow.
 * @returns Resolves when the runner has been started (runner runs until stopped).
 */
export async function main() {
  const runner = await Runner.newRunner({ configSchema })
  await runner.run(initWorkflow)
}

main()
