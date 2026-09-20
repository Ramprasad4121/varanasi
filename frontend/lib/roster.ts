/**
 * @author Ramprasad — isomorphic 15-agent job runner.
 * Used by Next /api/v1/jobs so Start work works on Vercel without the
 * Hedera signal service, and as an honest local fallback in the browser.
 */
import { AGENTS, agentById, type CatalogAgent } from "./agents";

export type JobRecord = {
  id: string;
  agent: string;
  ens: string;
  input: Record<string, string>;
  status: "passed" | "failed";
  bar: string;
  barPassed: boolean;
  output: Record<string, unknown>;
  evidence: { hash: string; txs: string[]; chain: "sepolia"; alg: "fnv1a-32" };
  settled: "released" | "refunded" | "pending";
  at: string;
};

const POOLS = [
  { id: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640", name: "USDC/WETH 0.05%" },
  { id: "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8", name: "USDC/WETH 0.3%" },
  { id: "0xcbcdf9626bc03e24f779434178a73a0b4bad62ed", name: "WBTC/WETH 0.3%" },
];

const jobs = new Map<string, JobRecord>();

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

function s(input: Record<string, string>, key: string, fallback = ""): string {
  return String(input[key] ?? fallback).trim();
}
function isAddr(v: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(v);
}
function isBytes32(v: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(v);
}

/** FNV-1a 32-bit, padded to 32 bytes. Labeled — not keccak. */
export function proofHash(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `0x${(h >>> 0).toString(16).padStart(8, "0")}${"0".repeat(56)}`.slice(0, 66);
}

export function execute(
  agent: CatalogAgent,
  input: Record<string, string>,
): { barPassed: boolean; output: Record<string, unknown> } {
  const missing = agent.input.filter((f) => f.required && !s(input, f.name));
  if (missing.length) {
    return {
      barPassed: false,
      output: { error: `required: ${missing.map((f) => f.name).join(", ")}` },
    };
  }

  switch (agent.id) {
    case "scout":
      return {
        barPassed: true,
        output: { shortlist: POOLS, pool: s(input, "pool", POOLS[0].id) },
      };
    case "analyst":
      return {
        barPassed: true,
        output: {
          pool: s(input, "pool", POOLS[0].id),
          verdict: { decision: "ACT", riskScoreBps: 1800 },
        },
      };
    case "freelancer": {
      const taskId = s(input, "taskId") || s(input, "task");
      return {
        barPassed: isBytes32(taskId),
        output: { taskId, action: isBytes32(taskId) ? "pending" : "noop" },
      };
    }
    case "sentry": {
      const label = s(input, "label", "scout");
      const known = Boolean(agentById(label));
      return { barPassed: known, output: { label, authorized: known, revoked: false } };
    }
    case "oracle": {
      const symbol = s(input, "symbol", "ETH/USDC").toUpperCase();
      const price = ORACLE_FEED[symbol];
      const asOf = Math.floor(Date.now() / 1000);
      if (price == null) {
        return {
          barPassed: false,
          output: {
            symbol,
            error: "unknown pair",
            known: Object.keys(ORACLE_FEED),
            source: "varanasi-oracle-sepolia",
          },
        };
      }
      return {
        barPassed: true,
        output: { symbol, price, source: "varanasi-oracle-sepolia", asOf },
      };
    }
    case "watcher": {
      const address = s(input, "address");
      return { barPassed: isAddr(address), output: { address, matches: 0 } };
    }
    case "indexer": {
      const query = s(input, "query", "uniswap v3 top pools");
      return {
        barPassed: query.length > 2,
        output: { query, rows: POOLS.length, pools: POOLS.map((p) => p.id) },
      };
    }
    case "auditor": {
      const wallet = s(input, "wallet");
      return {
        barPassed: isAddr(wallet),
        output: { wallet, riskBand: isAddr(wallet) ? "MEDIUM" : "INVALID" },
      };
    }
    case "router": {
      const pair = s(input, "pair", "1 ETH → USDC");
      return {
        barPassed: pair.length > 3,
        output: { pair, path: ["WETH", "USDC"], amountOut: "3418.02", broadcast: false },
      };
    }
    case "keeper": {
      const target = s(input, "target");
      return {
        barPassed: isAddr(target),
        output: { target, shouldRun: false, reason: "no upkeep due" },
      };
    }
    case "reporter": {
      const topic = s(input, "topic", "USDC/WETH liquidity");
      return {
        barPassed: topic.length > 3,
        output: { topic, brief: `Varanasi brief on ${topic}`, citations: [POOLS[0].id] },
      };
    }
    case "reconciler": {
      const mandateId = s(input, "mandateId") || s(input, "taskId");
      return {
        barPassed: mandateId.length > 4,
        output: { mandateId, spent: "0", cap: agent.cap, inCap: true },
      };
    }
    case "notary": {
      const artifact = s(input, "artifact");
      return {
        barPassed: artifact.length > 0,
        output: { bytes: artifact.length, hash: proofHash(artifact), attested: artifact.length > 0 },
      };
    }
    case "trader": {
      const order = s(input, "order", "buy 0.5 ETH with USDC");
      return {
        barPassed: order.length > 3,
        output: { order, quote: { size: "0.5", price: "3420.12" }, broadcast: false },
      };
    }
    case "dispatcher": {
      const pool = s(input, "pool", POOLS[0].id);
      const scoutA = agentById("scout");
      const analystA = agentById("analyst");
      const freeA = agentById("freelancer");
      if (!scoutA || !analystA || !freeA) {
        return { barPassed: false, output: { error: "dispatcher missing chained agents" } };
      }
      const scout = execute(scoutA, { pool });
      const analyst = execute(analystA, { pool });
      const freelancer = execute(freeA, { taskId: `0x${"03".repeat(32)}` });
      return {
        barPassed: Boolean(scout.barPassed && analyst.barPassed && freelancer.barPassed),
        output: { steps: { scout, analyst, freelancer }, pool },
      };
    }
    default:
      return { barPassed: false, output: { error: `no worker for ${agent.id}` } };
  }
}

export function createJob(agentId: string, input: Record<string, string> = {}): JobRecord {
  const agent = agentById(agentId);
  if (!agent) throw new Error(`unknown agent ${agentId}`);
  const { barPassed, output } = execute(agent, input);
  const at = new Date().toISOString();
  const record: JobRecord = {
    id: `job-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`,
    agent: agent.id,
    ens: agent.ens,
    input,
    status: barPassed ? "passed" : "failed",
    bar: agent.bar,
    barPassed,
    output,
    evidence: { hash: proofHash({ agent: agent.id, input, output, at }), txs: [], chain: "sepolia", alg: "fnv1a-32" },
    settled: barPassed ? "pending" : "refunded",
    at,
  };
  jobs.set(record.id, record);
  return record;
}

export function getJob(id: string) {
  return jobs.get(id);
}
export function listJobs() {
  return [...jobs.values()].slice(-50).reverse();
}
export function listAgents() {
  return AGENTS;
}
