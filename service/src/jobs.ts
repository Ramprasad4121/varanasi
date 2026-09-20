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
    case 'analyst': return { barPassed: true, output: { pool: s(input, 'pool', POOLS[0].id), verdict: { decision: 'ACT', riskScoreBps: 1800 } } };
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
    case 'indexer': return { barPassed: true, output: { query: s(input, 'query', 'uniswap v3'), rows: POOLS.length } };
    case 'auditor': return { barPassed: isAddr(s(input, 'wallet')), output: { wallet: s(input, 'wallet'), riskBand: 'MEDIUM' } };
    case 'router': return { barPassed: true, output: { pair: s(input, 'pair', '1 ETH → USDC'), path: ['WETH', 'USDC'], broadcast: false } };
    case 'keeper': return { barPassed: isAddr(s(input, 'target')), output: { target: s(input, 'target'), shouldRun: false } };
    case 'reporter': return { barPassed: true, output: { topic: s(input, 'topic', 'liquidity'), citations: [POOLS[0].id] } };
    case 'reconciler': return { barPassed: s(input, 'mandateId', 'mandate-1').length > 4, output: { inCap: true, cap: agent.cap } };
    case 'notary': return { barPassed: s(input, 'artifact').length > 0, output: { bytes: s(input, 'artifact').length } };
    case 'trader': return { barPassed: true, output: { order: s(input, 'order', 'buy 0.5 ETH'), broadcast: false } };
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
