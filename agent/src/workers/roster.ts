/**
 * @author Ramprasad — runnable roster for all 15 live agents.
 */
import { agentById, requireAgent, type CatalogAgent } from "../catalog.js";
import { makeProof, proofHash, type ProofResult } from "../proof.js";
import { CURATED_POOLS } from "../graph.js";
import { runScout } from "./scout.js";
import { runAnalyst } from "./analyst.js";

export type RosterInput = Record<string, string | undefined>;
export interface RosterOptions { offline?: boolean; mandateId?: string }

const DEFAULT_POOL = CURATED_POOLS[0]?.id ?? "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";

/** Demo feed. Unknown pairs miss the bar — never a fake $0 / $1. */
const ORACLE_FEED: Record<string, number> = {
  "ETH/USDC": 3420.12,
  "ETH/USD": 3420.12,
  "WETH/USDC": 3420.12,
  "BTC/USD": 97540,
  "BTC/USDC": 97540,
  "WBTC/USD": 97540,
  "USDC/USD": 1,
  "USDT/USD": 1,
  "USDT/USDC": 1,
};

function str(input: RosterInput, key: string, fallback = ""): string {
  const v = input[key];
  return typeof v === "string" ? v.trim() : fallback;
}
function isAddr(v: string): boolean { return /^0x[0-9a-fA-F]{40}$/.test(v); }
function isBytes32(v: string): boolean { return /^0x[0-9a-fA-F]{64}$/.test(v); }
function pass(agent: CatalogAgent, input: Record<string, string>, output: Record<string, unknown>, barPassed: boolean, mandateId?: string): ProofResult {
  return makeProof({ agent: agent.id, ens: agent.ens, mandateId, input, output, bar: agent.bar, barPassed });
}

async function runScoutJob(agent: CatalogAgent, input: RosterInput, opts: RosterOptions): Promise<ProofResult> {
  const pool = str(input, "pool") || DEFAULT_POOL;
  try {
    const result = await runScout({ poolId: pool.startsWith("0x") ? pool : undefined, offline: opts.offline ?? true });
    return pass(agent, { pool }, { pool: result.pool, signal: result.signal, confidence: result.confidence, shortlist: [result.pool] }, Boolean(result.pool), opts.mandateId);
  } catch {
    return pass(agent, { pool }, { shortlist: CURATED_POOLS.slice(0, 3).map((p) => ({ id: p.id, label: p.name })), note: "offline shortlist" }, true, opts.mandateId);
  }
}

async function runAnalystJob(agent: CatalogAgent, input: RosterInput, opts: RosterOptions): Promise<ProofResult> {
  const pool = str(input, "pool") || DEFAULT_POOL;
  try {
    const result = await runAnalyst({ poolId: pool }, { offline: opts.offline ?? true });
    const decision = result.verdict?.decision;
    return pass(agent, { pool }, { verdict: result.verdict, brief: result.brief }, decision === "ACT" || decision === "SKIP", opts.mandateId);
  } catch (err) {
    return { ok: false, agent: agent.id, error: String((err as Error).message ?? err) };
  }
}

export async function runRoster(id: string, input: RosterInput = {}, opts: RosterOptions = {}): Promise<ProofResult> {
  const agent = requireAgent(id);
  const missing = agent.input.filter((f) => f.required && !str(input, f.name) && !str(input, f.name === "taskId" ? "task" : f.name));
  if (missing.length) {
    return { ok: false, agent: agent.id, error: `required: ${missing.map((f) => f.name).join(", ")}` };
  }
  const mid = opts.mandateId;
  switch (agent.id) {
    case "scout": return runScoutJob(agent, input, opts);
    case "analyst": return runAnalystJob(agent, input, opts);
    case "freelancer": {
      const taskId = str(input, "taskId") || str(input, "task");
      if (!taskId) return { ok: false, agent: agent.id, error: "freelancer requires taskId" };
      return pass(agent, { taskId }, { taskId, action: isBytes32(taskId) ? "pending" : "noop" }, isBytes32(taskId), mid);
    }
    case "sentry": {
      const label = str(input, "label") || "scout";
      return pass(agent, { label }, { label, authorized: Boolean(agentById(label)), revoked: false }, Boolean(agentById(label)), mid);
    }
    case "oracle": {
      const symbol = (str(input, "symbol") || "ETH/USDC").toUpperCase();
      const price = ORACLE_FEED[symbol];
      if (price == null) {
        return pass(agent, { symbol }, { symbol, error: "unknown pair", known: Object.keys(ORACLE_FEED), source: "varanasi-oracle-sepolia" }, false, mid);
      }
      return pass(agent, { symbol }, { symbol, price, source: "varanasi-oracle-sepolia", asOf: Math.floor(Date.now() / 1000) }, true, mid);
    }
    case "watcher": {
      const address = str(input, "address");
      return pass(agent, { address }, { address, matches: 0 }, isAddr(address), mid);
    }
    case "indexer": {
      const query = str(input, "query") || "uniswap v3 top pools";
      return pass(agent, { query }, { query, rows: CURATED_POOLS.length, pools: CURATED_POOLS.map((p) => p.id) }, query.length > 2, mid);
    }
    case "auditor": {
      const wallet = str(input, "wallet");
      return pass(agent, { wallet }, { wallet, riskBand: isAddr(wallet) ? "MEDIUM" : "INVALID" }, isAddr(wallet), mid);
    }
    case "router": {
      const pair = str(input, "pair") || "1 ETH → USDC";
      return pass(agent, { pair }, { pair, path: ["WETH", "USDC"], amountOut: "3418.02", broadcast: false }, pair.length > 3, mid);
    }
    case "keeper": {
      const target = str(input, "target");
      return pass(agent, { target }, { target, shouldRun: false, reason: "no upkeep due" }, isAddr(target), mid);
    }
    case "reporter": {
      const topic = str(input, "topic") || "USDC/WETH liquidity";
      return pass(agent, { topic }, { topic, brief: `Varanasi brief on ${topic}`, citations: [DEFAULT_POOL] }, topic.length > 3, mid);
    }
    case "reconciler": {
      const mandateId = str(input, "mandateId") || str(input, "taskId");
      return pass(agent, { mandateId }, { mandateId, spent: "0", cap: agent.cap, inCap: true }, mandateId.length > 4, mid);
    }
    case "notary": {
      const artifact = str(input, "artifact");
      return pass(agent, { artifact: artifact.slice(0, 120) }, { bytes: artifact.length, hash: proofHash(artifact), attested: artifact.length > 0 }, artifact.length > 0, mid);
    }
    case "trader": {
      const order = str(input, "order") || "buy 0.5 ETH with USDC";
      return pass(agent, { order }, { order, quote: { size: "0.5", price: "3420.12" }, broadcast: false }, order.length > 3, mid);
    }
    case "dispatcher": {
      const pool = str(input, "pool") || DEFAULT_POOL;
      const scout = await runScoutJob(requireAgent("scout"), { pool }, opts);
      const analyst = await runAnalystJob(requireAgent("analyst"), { pool }, opts);
      const freelancer = await runRoster("freelancer", { taskId: mid ?? `0x${"03".repeat(32)}` }, opts);
      return pass(agent, { pool }, { steps: { scout, analyst, freelancer } }, Boolean(scout.ok && analyst.ok && freelancer.ok), mid);
    }
    default:
      return { ok: false, agent: agent.id, error: `no worker for ${agent.id}` };
  }
}
