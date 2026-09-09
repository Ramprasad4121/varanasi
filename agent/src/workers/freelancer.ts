/**
 * @author Ramprasad — EscrowFreelancer worker: monitor taskState → release on Validated, refund past expiry.
 *
 * Env deps: SEPOLIA_RPC_URL (read path via escrow.ts; override via opts.rpcUrl).
 * No private-key flags — the caller supplies a funded WalletClient; this
 * module never reads keys from env/flags/stdin and never broadcasts on import.
 *
 * Fail-closed: unknown task state, mandate/taskId mismatch, or a Funded task
 * still inside its refund gate all return without broadcasting (pending/noop),
 * never a speculative release.
 */
import type { Hash } from "viem";
import {
  readTask,
  releaseTask,
  refundTask,
  type EscrowOptions,
  type EscrowTask,
  type EscrowWallet,
} from "../escrow.js";
import { mandateTaskId, validateMandate, type Mandate, type MandateDomainOpts } from "../mandate.js";

/** What the freelancer did (or deliberately did not do). */
export type FreelancerAction = "released" | "refunded" | "pending" | "noop";

/** Freelancer output: observed state plus the settlement receipt (if any). */
export interface FreelancerResult {
  taskId: Hash;
  state: number;
  label: string;
  action: FreelancerAction;
  txHash: Hash | null;
}

/** Overrides for runFreelancer (escrow deployment, RPC, clock, mandate binding). */
export interface FreelancerOptions extends EscrowOptions {
  /** Optional signed-mandate binding: when supplied, taskId must equal mandateTaskId. */
  mandate?: Mandate;
  /** Domain overrides for the mandate binding check. */
  domain?: MandateDomainOpts;
  /** Unix seconds used as "now" for the expiry gate (default: Date.now()). */
  nowSec?: number;
}

/** Injectable escrow surface (defaults to escrow.ts live functions). */
export interface FreelancerDeps {
  getTask?: (taskId: Hash) => Promise<EscrowTask>;
  release?: (taskId: Hash, wallet: EscrowWallet) => Promise<Hash>;
  refund?: (taskId: Hash, wallet: EscrowWallet) => Promise<Hash>;
}

/**
 * Pure core: decide the freelancer action from an observed task record.
 * @param task Onchain task record (state + expiry).
 * @param nowSec Unix seconds used as "now".
 * @returns Action without broadcasting: release/refund/pending/noop.
 */
export function decideFreelancerAction(task: Pick<EscrowTask, "state" | "label" | "expiry">, nowSec: number): FreelancerAction {
  switch (task.state) {
    case 2: // Validated → release path
      return "released";
    case 1: { // Funded → refund only strictly past expiry
      const expiry = Number(task.expiry);
      if (!Number.isFinite(expiry)) return "pending";
      return nowSec > expiry ? "refunded" : "pending";
    }
    case 3: // Released
    case 4: // Refunded
    case 5: // Cancelled
      return "noop";
    default:
      // None (0) or unknown enum → never broadcast.
      return "pending";
  }
}

/**
 * Live wrapper: bind mandate (when supplied) → read task → release on
 * Validated, refund past expiry, else return without broadcasting.
 * The caller supplies the wallet; keys never enter this module.
 * @param taskId Escrow task id (bytes32).
 * @param wallet Caller-supplied wallet client (broadcasts release/refund only).
 * @param opts Escrow options plus mandate binding + clock override.
 * @param deps Injectable { getTask, release, refund } (tests only).
 * @returns FreelancerResult with observed state, action, and tx hash (if any).
 */
export async function runFreelancer(
  taskId: Hash,
  wallet: EscrowWallet,
  opts: FreelancerOptions = {},
  deps: FreelancerDeps = {},
): Promise<FreelancerResult> {
  if (opts.mandate) {
    validateMandate(opts.mandate);
    const bound = mandateTaskId(opts.mandate, opts.domain ?? {});
    if (bound.toLowerCase() !== String(taskId).toLowerCase()) {
      throw new Error("Freelancer: mandate does not bind to taskId — refusing to settle another owner's task.");
    }
  }

  const getTask = deps.getTask ?? ((id: Hash) => readTask(id, opts));
  const release = deps.release ?? ((id: Hash, w: EscrowWallet) => releaseTask(id, w, opts));
  const refund = deps.refund ?? ((id: Hash, w: EscrowWallet) => refundTask(id, w, opts));

  const task = await getTask(taskId);
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const action = decideFreelancerAction(task, nowSec);

  if (action === "released") {
    const txHash = await release(taskId, wallet);
    return { taskId, state: task.state, label: task.label, action, txHash };
  }
  if (action === "refunded") {
    const txHash = await refund(taskId, wallet);
    return { taskId, state: task.state, label: task.label, action, txHash };
  }
  return { taskId, state: task.state, label: task.label, action, txHash: null };
}
