import { createHash, randomUUID } from 'node:crypto';
import { AGENTS, agentById, type CatalogAgent } from './catalog.js';

export type JobRecord = {
  id: string;
  agent: string;
  ens: string;
  input: Record<string, string>;
  status: 'running' | 'passed' | 'failed';
  bar: string;
  barPassed: boolean;
  output: Record<string, unknown>;
  evidence: { hash: string; txs: string[]; chain: 'sepolia' };
  settled: 'released' | 'refunded' | 'pending';
  at: string;
};

const jobs = new Map<string, JobRecord>();

/** Demo feed. Unknown pairs miss the bar — never a fake $0 / $1. */
const ORACLE_FEED: Record<string, number> = {
  'ETH/USDC': 3420.12,
  'ETH/USD': 3420.12,
  'WETH/USDC': 3420.12,
  'BTC/USD': 97540,
  'BTC/USDC': 97540,
  'WBTC/USD': 97540,
  'USDC/USD': 1,
  'USDT/USD': 1,
  'USDT/USDC': 1,
};
const POOLS = [
  { id: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640', name: 'USDC/WETH 0.05%' },
  { id: '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8', name: 'USDC/WETH 0.3%' },
  { id: '0xcbcdf9626bc03e24f779434178a73a0b4bad62ed', name: 'WBTC/WETH 0.3%' },
];


/** Demo quotes. Unknown pairs miss the bar — never a fake WETH/USDC fill. */
const QUOTE_BOOK: Record<string, { path: string[]; amountOut: string; venue: string }> = {
  "ETH/USDC": { path: ["WETH", "USDC"], amountOut: "3418.02", venue: "Uniswap v3 0.05%" },
  "WETH/USDC": { path: ["WETH", "USDC"], amountOut: "3418.02", venue: "Uniswap v3 0.05%" },
  "ETH/USDT": { path: ["WETH", "USDT"], amountOut: "3418.02", venue: "Uniswap v3 0.05%" },
  "BTC/USDC": { path: ["WBTC", "USDC"], amountOut: "97480", venue: "Uniswap v3 0.30%" },
  "WBTC/USDC": { path: ["WBTC", "USDC"], amountOut: "97480", venue: "Uniswap v3 0.30%" },
  "BTC/USD": { path: ["WBTC", "USDC"], amountOut: "97480", venue: "Uniswap v3 0.30%" },
  "WBTC/WETH": { path: ["WBTC", "WETH"], amountOut: "28.50", venue: "Uniswap v3 0.30%" },
  "USDC/USDT": { path: ["USDC", "USDT"], amountOut: "0.9998", venue: "Uniswap v3 0.01%" },
  "USDT/USDC": { path: ["USDT", "USDC"], amountOut: "1.0001", venue: "Uniswap v3 0.01%" },
};

function parsePairSymbol(raw: string): string | null {
  const n = raw
    .toUpperCase()
    .replace(/→/g, "/")
    .replace(/\s+TO\s+/g, "/")
    .replace(/,/g, "")
    .replace(/\s+/g, "");
  const stripped = n.replace(/^[0-9.]+/, "");
  const m = stripped.match(/^(WETH|ETH|WBTC|BTC|USDC|USDT)\/(WETH|ETH|WBTC|BTC|USDC|USDT)$/);
  if (!m || m[1] === m[2]) return null;
  return `${m[1]}/${m[2]}`;
}
function lookupQuote(raw: string) {
  const pair = parsePairSymbol(raw);
  if (!pair) return null;
  const quote = QUOTE_BOOK[pair];
  if (!quote) return null;
  return { pair, ...quote };
}
function queryHitsCatalog(q: string): boolean {
  return /\b(ETH|WETH|BTC|WBTC|USDC|USDT|UNI|UNISWAP|POOL|V3|V2|GRAPH|SUBGRAPH)\b/i.test(q);
}
function parseOrder(raw: string) {
  const n = raw.toUpperCase().replace(/→/g, " ").replace(/,/g, " ");
  const m = n.match(/\b(BUY|SELL)\s+([\d.]+)\s+(WETH|ETH|WBTC|BTC|USDC|USDT)\s+(?:WITH|FOR|IN)\s+(WETH|ETH|WBTC|BTC|USDC|USDT)\b/);
  if (!m || m[3] === m[4]) return null;
  return { side: m[1], size: m[2], base: m[3], quote: m[4], pair: `${m[3]}/${m[4]}` };
}
function hashOf(value: unknown): string {
  return `0x${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}
function isAddr(v: string): boolean { return /^0x[0-9a-fA-F]{40}$/.test(v); }
function isBytes32(v: string): boolean { return /^0x[0-9a-fA-F]{64}$/.test(v); }
function s(input: Record<string, string>, key: string, fallback = ''): string {
  return String(input[key] ?? fallback).trim();
}

function execute(agent: CatalogAgent, input: Record<string, string>): { barPassed: boolean; output: Record<string, unknown> } {
  const missing = agent.input.filter((f) => f.required && !s(input, f.name));
  if (missing.length) {
    return { barPassed: false, output: { error: `required: ${missing.map((f) => f.name).join(', ')}` } };
  }
  switch (agent.id) {
    case 'scout': return { barPassed: true, output: { shortlist: POOLS, pool: s(input, 'pool', POOLS[0].id) } };
    case 'analyst': {
      const pool = s(input, 'pool');
      const known = POOLS.find((p) => p.id.toLowerCase() === pool.toLowerCase() || p.name.toUpperCase().includes(pool.toUpperCase()));
      if (!known) return { barPassed: false, output: { pool, error: 'unknown pool', known: POOLS.map((p) => p.id) } };
      return { barPassed: true, output: { pool: known.id, name: known.name, verdict: { decision: 'ACT', riskScoreBps: 1800 } } };
    }
    case 'freelancer': {
      const taskId = s(input, 'taskId') || s(input, 'task');
      return { barPassed: isBytes32(taskId), output: { taskId, action: isBytes32(taskId) ? 'pending' : 'noop' } };
    }
    case 'sentry': {
      const label = s(input, 'label', 'scout');
      return { barPassed: Boolean(agentById(label)), output: { label, authorized: Boolean(agentById(label)) } };
    }
    case 'oracle': {
      const symbol = s(input, 'symbol', 'ETH/USDC').toUpperCase();
      const price = ORACLE_FEED[symbol];
      if (price == null) {
        return {
          barPassed: false,
          output: { symbol, error: 'unknown pair', known: Object.keys(ORACLE_FEED), source: 'varanasi-oracle-sepolia' },
        };
      }
      return {
        barPassed: true,
        output: { symbol, price, source: 'varanasi-oracle-sepolia', asOf: Math.floor(Date.now() / 1000) },
      };
    }
    case 'watcher': return { barPassed: isAddr(s(input, 'address')), output: { address: s(input, 'address'), matches: 0 } };
    case 'indexer': {
      const query = s(input, 'query', 'uniswap v3');
      if (!queryHitsCatalog(query)) return { barPassed: false, output: { query, error: 'unknown query', rows: 0 } };
      return { barPassed: true, output: { query, rows: POOLS.length } };
    }
    case 'auditor': return { barPassed: isAddr(s(input, 'wallet')), output: { wallet: s(input, 'wallet'), riskBand: 'MEDIUM' } };
    case 'router': {
      const pair = s(input, 'pair', '1 ETH → USDC');
      const quote = lookupQuote(pair);
      if (!quote) return { barPassed: false, output: { pair, error: 'unknown pair', broadcast: false, known: Object.keys(QUOTE_BOOK) } };
      return { barPassed: true, output: { pair: quote.pair, path: quote.path, amountOut: quote.amountOut, venue: quote.venue, broadcast: false } };
    }
    case 'keeper': return { barPassed: isAddr(s(input, 'target')), output: { target: s(input, 'target'), shouldRun: false } };
    case 'reporter': {
      const topic = s(input, 'topic', 'USDC/WETH liquidity');
      const hit = /\b(ETH|WETH|BTC|WBTC|USDC|USDT|UNI|UNISWAP)\b/i.test(topic);
      if (!hit) return { barPassed: false, output: { topic, error: 'unknown topic', citations: [] } };
      return { barPassed: true, output: { topic, brief: `Varanasi brief on ${topic}`, citations: [POOLS[0].id] } };
    }
    case 'reconciler': {
      const mandateId = s(input, 'mandateId') || s(input, 'taskId');
      if (!isBytes32(mandateId)) return { barPassed: false, output: { mandateId, error: 'mandateId must be bytes32', inCap: false } };
      return { barPassed: true, output: { mandateId, spent: '0', cap: agent.cap, inCap: true } };
    }
    case 'notary': return { barPassed: s(input, 'artifact').length > 0, output: { bytes: s(input, 'artifact').length } };
    case 'trader': {
      const order = s(input, 'order', 'buy 0.5 ETH with USDC');
      const parsed = parseOrder(order);
      const price = parsed
        ? (ORACLE_FEED[parsed.pair] ?? ORACLE_FEED[parsed.pair.replace('WETH', 'ETH').replace('WBTC', 'BTC')])
        : undefined;
      if (!parsed || price == null) return { barPassed: false, output: { order, error: 'unknown order', broadcast: false } };
      return { barPassed: true, output: { order, quote: { size: parsed.size, price, pair: parsed.pair }, broadcast: false } };
    }
    case 'dispatcher': return { barPassed: true, output: { steps: ['scout', 'analyst', 'freelancer'], pool: s(input, 'pool', POOLS[0].id) } };
    default: return { barPassed: false, output: { error: 'no worker' } };
  }
}

export function listAgents() { return AGENTS; }

export function createJob(agentId: string, input: Record<string, string> = {}): JobRecord {
  const agent = agentById(agentId);
  if (!agent) throw new Error(`unknown agent ${agentId}`);
  const { barPassed, output } = execute(agent, input);
  const at = new Date().toISOString();
  const record: JobRecord = {
    id: randomUUID(),
    agent: agent.id,
    ens: agent.ens,
    input,
    status: barPassed ? 'passed' : 'failed',
    bar: agent.bar,
    barPassed,
    output,
    evidence: { hash: hashOf({ agent: agent.id, input, output, at }), txs: [], chain: 'sepolia' },
    settled: barPassed ? 'pending' : 'refunded',
    at,
  };
  jobs.set(record.id, record);
  return record;
}

export function getJob(id: string) { return jobs.get(id); }
export function listJobs() { return [...jobs.values()].slice(-50).reverse(); }
