/**
 * POST /api/v1/attest — allowlisted-validator relayer for Sepolia TaskEscrow.
 * Author: Ramprasad
 *
 * Re-runs the roster worker (never trusts a client score), then
 * submitValidation(taskId, score) with SEPOLIA_VALIDATOR_KEY.
 * Fail-closed: no key / key not allowlisted / no gas → 503.
 * Junk agent/input → 400. Unfunded or settled task → 409. No chain write
 * on those paths. Same score already onchain → 200 already:true, no tx.
 */
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { json, preflight } from "@/lib/api-cors";
import { createJob } from "@/lib/roster";
import { TASK_ESCROW } from "@/lib/site";

export const dynamic = "force-dynamic";

const PASS_SCORE = 8000;
const FAIL_SCORE = 2000;
const TASK_RE = /^0x[0-9a-fA-F]{64}$/;
const KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const MIN_VALIDATOR_WEI = BigInt("100000000000000"); // 0.0001 ETH

const ESCROW_ABI = [
  {
    type: "function",
    name: "submitValidation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "taskId", type: "bytes32" },
      { name: "scoreBps", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "taskState",
    stateMutability: "view",
    inputs: [{ name: "taskId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "isValidator",
    stateMutability: "view",
    inputs: [{ name: "validator", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "tasks",
    stateMutability: "view",
    inputs: [{ name: "taskId", type: "bytes32" }],
    outputs: [
      { name: "payer", type: "address" },
      { name: "agent", type: "address" },
      { name: "merchant", type: "address" },
      { name: "token", type: "address" },
      { name: "cap", type: "uint256" },
      { name: "fundedAmount", type: "uint256" },
      { name: "windowStart", type: "uint64" },
      { name: "windowEnd", type: "uint64" },
      { name: "expiry", type: "uint64" },
      { name: "scoreBps", type: "uint256" },
      { name: "validator", type: "address" },
      { name: "pinnedThresholdBps", type: "uint256" },
      { name: "pinnedValidator", type: "address" },
      { name: "state", type: "uint8" },
    ],
  },
] as const;

function rpcUrl(): string {
  const fromEnv = (process.env.SEPOLIA_RPC_URL ?? process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? "").trim();
  return fromEnv.length > 0 ? fromEnv : "https://ethereum-sepolia.publicnode.com";
}

function validatorKey(): Hex | null {
  const raw = (process.env.SEPOLIA_VALIDATOR_KEY ?? "").trim();
  if (!KEY_RE.test(raw)) return null;
  return raw as Hex;
}

function errMsg(err: unknown): string {
  if (err && typeof err === "object" && "shortMessage" in err && typeof (err as { shortMessage: unknown }).shortMessage === "string") {
    return (err as { shortMessage: string }).shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

export function OPTIONS() {
  return preflight();
}

export function GET() {
  const key = validatorKey();
  return json({
    ok: true,
    configured: key !== null,
    escrow: TASK_ESCROW,
    chain: "sepolia",
    validator: key ? privateKeyToAccount(key).address : null,
  });
}

export async function POST(req: Request) {
  const key = validatorKey();
  if (!key) {
    return json(
      {
        ok: false,
        error: "validator not configured — onchain attest is fail-closed until SEPOLIA_VALIDATOR_KEY is set",
      },
      503,
    );
  }

  let body: { taskId?: unknown; agent?: unknown; agentId?: unknown; input?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "JSON body required" }, 400);
  }

  const taskId = String(body.taskId ?? "").trim();
  if (!TASK_RE.test(taskId)) return json({ ok: false, error: "taskId must be bytes32" }, 400);
  const agent = String(body.agent ?? body.agentId ?? "").trim();
  if (!agent) return json({ ok: false, error: "agent is required" }, 400);
  const input =
    body.input && typeof body.input === "object" && !Array.isArray(body.input)
      ? Object.fromEntries(
          Object.entries(body.input as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]),
        )
      : {};

  let job;
  try {
    job = createJob(agent, input);
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }

  const scoreBps = job.barPassed ? PASS_SCORE : FAIL_SCORE;
  const account = privateKeyToAccount(key);
  const transport = http(rpcUrl());
  const publicClient = createPublicClient({ chain: sepolia, transport });

  try {
    const allowed = await publicClient.readContract({
      address: TASK_ESCROW as Address,
      abi: ESCROW_ABI,
      functionName: "isValidator",
      args: [account.address],
    });
    if (!allowed) {
      return json(
        { ok: false, error: "validator key is not allowlisted on TaskEscrow — setValidator first" },
        503,
      );
    }
    const gas = await publicClient.getBalance({ address: account.address });
    if (gas < MIN_VALIDATOR_WEI) {
      return json({ ok: false, error: "validator has no gas — attest is fail-closed" }, 503);
    }
  } catch (err) {
    return json({ ok: false, error: `validator check failed: ${errMsg(err)}` }, 502);
  }

  let task: {
    fundedAmount: bigint;
    windowStart: bigint;
    windowEnd: bigint;
    scoreBps: bigint;
    state: number;
  };
  try {
    const row = await publicClient.readContract({
      address: TASK_ESCROW as Address,
      abi: ESCROW_ABI,
      functionName: "tasks",
      args: [taskId as Hex],
    });
    const rec = row as unknown as Record<string, unknown> & readonly unknown[];
    const fundedAmount = (rec.fundedAmount ?? rec[5]) as bigint;
    const windowStart = (rec.windowStart ?? rec[6]) as bigint;
    const windowEnd = (rec.windowEnd ?? rec[7]) as bigint;
    const scoreOnchain = (rec.scoreBps ?? rec[9]) as bigint;
    const stateRaw = rec.state ?? rec[13];
    task = {
      fundedAmount,
      windowStart,
      windowEnd,
      scoreBps: scoreOnchain,
      state: Number(stateRaw),
    };
  } catch (err) {
    return json({ ok: false, error: `escrow read failed: ${errMsg(err)}` }, 502);
  }

  // 1 = Funded, 2 = Validated. Anything else is not attestable.
  if (task.state !== 1 && task.state !== 2) {
    return json(
      { ok: false, error: `task is not Funded/Validated (state ${task.state})`, job, scoreBps },
      409,
    );
  }
  if (task.fundedAmount === BigInt(0)) {
    return json({ ok: false, error: "task has no funded amount", job, scoreBps }, 409);
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now < task.windowStart || now > task.windowEnd) {
    return json(
      {
        ok: false,
        error: `outside validation window (${task.windowStart.toString()}–${task.windowEnd.toString()})`,
        job,
        scoreBps,
      },
      409,
    );
  }
  if (task.state === 2 && Number(task.scoreBps) === scoreBps) {
    return json({ ok: true, already: true, job, scoreBps, tx: null });
  }

  const wallet = createWalletClient({ account, chain: sepolia, transport });
  try {
    const { request } = await publicClient.simulateContract({
      account,
      address: TASK_ESCROW as Address,
      abi: ESCROW_ABI,
      functionName: "submitValidation",
      args: [taskId as Hex, BigInt(scoreBps)],
    });
    const hash = await wallet.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      return json({ ok: false, error: "attest tx reverted", job, scoreBps, tx: hash }, 502);
    }
    return json({
      ok: true,
      job,
      scoreBps,
      tx: hash,
      explorer: `https://sepolia.etherscan.io/tx/${hash}`,
    });
  } catch (err) {
    return json({ ok: false, error: errMsg(err), job, scoreBps }, 502);
  }
}
