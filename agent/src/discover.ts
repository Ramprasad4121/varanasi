/**
 * @author Ramprasad — ERC-8004/Agent0 agent discovery (live The Graph Gateway; env: GRAPH_API_KEY, AEGIS_OFFLINE).
 * Agent discovery for varanasi: agents discover work via ERC-8004 + Agent0 subgraphs.
 *
 * Load-bearing by design: the default path queries LIVE Agent0 ERC-8004
 * subgraphs over the network. `--offline`/offline fixture exists only so
 * unit tests / judges without a GRAPH_API_KEY can exercise the pipeline.
 *
 * Endpoint shape (live, no mocks — same key as graph.ts):
 * `https://gateway.thegraph.com/api/<GRAPH_API_KEY>/subgraphs/id/<ID>`
 *
 * Queries (verified Agent0 schema):
 * `{ agentRegistrationFiles(where: { mcpEndpoint_not: null, active: true }, first: N)
 *    { agentId name description mcpEndpoint mcpVersion mcpTools supportedTrusts } }`
 * Profile by id "chainId:agentId" with registrationFile{...x402Support, ens, did},
 * feedback, validations. Full schema:
 * github.com/agent0lab/subgraph/blob/main/schema.graphql
 */
import { GraphClient } from "./graph.js";

/** Agent0 ERC-8004 subgraph IDs (The Graph decentralized network). */
export const AGENT0_SUBGRAPHS = {
  /** Base mainnet (8453). Default discovery chain. */
  base: process.env.GRAPH_AGENT0_BASE_ID ?? "43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb",
  /** Ethereum mainnet (1). */
  eth: process.env.GRAPH_AGENT0_ETH_ID ?? "FV6RR6y13rsnCxBAicKuQEwDp8ioEGiNaWaZUmvr1F8k",
  /** Sepolia testnet (11155111, opt-in). */
  sepolia: process.env.GRAPH_AGENT0_SEPOLIA_ID ?? "6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT",
} as const;

export type DiscoverChain = keyof typeof AGENT0_SUBGRAPHS;

/** Chain id each discovery chain reports in normalized output. */
export const DISCOVER_CHAIN_IDS: Record<DiscoverChain, number> = {
  base: 8453,
  eth: 1,
  sepolia: 11155111,
};

/** Chain keys searched by default (Base) — Sepolia is opt-in only. */
export const DEFAULT_DISCOVER_CHAINS: DiscoverChain[] = ["base"];

/** Agent0 agent-listing query (verified schema). */
export const AGENT_SEARCH_QUERY = /* graphql */ `
  query AgentSearch($first: Int!) {
    agentRegistrationFiles(where: { mcpEndpoint_not: null, active: true }, first: $first) {
      agentId
      name
      description
      mcpEndpoint
      mcpVersion
      mcpTools
      supportedTrusts
    }
  }
`;

/** Agent0 single-agent profile query (verified schema). */
export const AGENT_PROFILE_QUERY = /* graphql */ `
  query AgentProfile($id: ID!) {
    agent(id: $id) {
      id
      agentId
      registrationFile {
        agentId
        name
        description
        mcpEndpoint
        mcpVersion
        mcpTools
        supportedTrusts
        x402Support
        ens
        did
      }
      feedback {
        id
      }
      validations {
        id
      }
    }
  }
`;

/** Raw Agent0 agentRegistrationFiles row. */
export interface AgentRegistrationRaw {
  agentId?: string | number | null;
  name?: string | null;
  description?: string | null;
  mcpEndpoint?: string | null;
  mcpVersion?: string | null;
  mcpTools?: unknown;
  supportedTrusts?: unknown;
  x402Support?: unknown;
  ens?: string | null;
  did?: string | null;
}

/** Normalized discovered agent consumed by varanasi callers. */
export interface DiscoveredAgent {
  /** Agent id as reported by the subgraph (agentId, stringified). */
  id: string;
  /** Discovery chain key (base | eth | sepolia). */
  chain: DiscoverChain;
  /** EVM chain id for the discovery chain. */
  chainId: number;
  name: string;
  description: string;
  mcpEndpoint: string;
  /** True when the registration advertises x402 payment support. */
  x402Support: boolean;
  /** Supported trust entries (stringified; empty when absent). */
  trust: string[];
  /** Feedback entry count (0 when the profile leg is not fetched). */
  feedbackCount: number;
  /** Raw Graph response excerpt for auditability. */
  rawExcerpt: unknown;
}

/** Options for searchAgents. */
export interface SearchAgentsOptions {
  /** Chain key or keys (default: Base only; Sepolia opt-in). */
  chain?: DiscoverChain | DiscoverChain[];
  /** Filter: "mcp" (has mcpEndpoint), "x402" (advertises x402Support), or omit for all. */
  capability?: "mcp" | "x402";
  /** Page size per chain (default 10). */
  first?: number;
  /** The Graph Gateway API key (default: env GRAPH_API_KEY). */
  apiKey?: string;
  /** When true, all queries return the local fixture (tests only). */
  offline?: boolean;
}

/** Local fixture rows returned in offline mode (tests only, never demos). */
export const DISCOVER_OFFLINE_FIXTURE: AgentRegistrationRaw[] = [
  {
    agentId: "7",
    name: "OFFLINE Weather Oracle",
    description: "Offline fixture agent with MCP + x402 support.",
    mcpEndpoint: "https://offline.example/mcp",
    mcpVersion: "1.0",
    mcpTools: ["get_weather"],
    supportedTrusts: ["reputation"],
    x402Support: true,
    ens: "offline-agent.aegis.eth",
    did: "did:eth:offline-7",
  },
  {
    agentId: "9",
    name: "OFFLINE MCP Only",
    description: "Offline fixture agent without x402.",
    mcpEndpoint: "https://offline-mcp.example/mcp",
    mcpVersion: "1.0",
    mcpTools: ["ping"],
    supportedTrusts: [],
    x402Support: false,
    ens: null,
    did: null,
  },
];

/**
 * Normalize a raw Agent0 registration row into a DiscoveredAgent.
 * @param chain Discovery chain key the row came from.
 * @param r Raw registration row (throws on missing agentId).
 * @param feedbackCount Feedback entry count (default 0).
 * @returns Normalized DiscoveredAgent.
 */
export function toDiscoveredAgent(
  chain: DiscoverChain,
  r: AgentRegistrationRaw | null,
  feedbackCount = 0,
): DiscoveredAgent {
  if (r == null || r.agentId == null || String(r.agentId) === "") {
    throw new Error("Agent not found on subgraph — check chain / agent id.");
  }
  const tools = Array.isArray(r.mcpTools) ? r.mcpTools.map(String) : [];
  void tools; // mcpTools retained on rawExcerpt; normalization keeps the discovery surface minimal
  const trusts = Array.isArray(r.supportedTrusts) ? r.supportedTrusts.map(String) : [];
  return {
    id: String(r.agentId),
    chain,
    chainId: DISCOVER_CHAIN_IDS[chain],
    name: r.name ?? "",
    description: r.description ?? "",
    mcpEndpoint: r.mcpEndpoint ?? "",
    x402Support: r.x402Support === true || r.x402Support === "true" || r.x402Support === 1,
    trust: trusts,
    feedbackCount,
    rawExcerpt: r,
  };
}

/**
 * Search live Agent0 ERC-8004 subgraphs for agents.
 * Default: Base only. Sepolia is opt-in (pass chain: "sepolia" or include it).
 * @param opts Chain(s), capability filter, page size, key, offline flag.
 * @returns Normalized discovered agents across the requested chains.
 */
export async function searchAgents(opts: SearchAgentsOptions = {}): Promise<DiscoveredAgent[]> {
  const chains = opts.chain === undefined ? DEFAULT_DISCOVER_CHAINS : Array.isArray(opts.chain) ? opts.chain : [opts.chain];
  const first = opts.first ?? 10;
  const offline = opts.offline ?? process.env.AEGIS_OFFLINE === "1";
  if (offline) {
    return DISCOVER_OFFLINE_FIXTURE.map((r) => toDiscoveredAgent(chains[0] ?? "base", r, 0)).filter((a) =>
      matchesCapability(a, rToX402(a.rawExcerpt as AgentRegistrationRaw), opts.capability),
    );
  }
  const graph = new GraphClient({ apiKey: opts.apiKey, offline: false });
  const out: DiscoveredAgent[] = [];
  for (const chain of chains) {
    const subgraphId = AGENT0_SUBGRAPHS[chain];
    if (!subgraphId) throw new Error(`Unknown discover chain "${chain}" (want base|eth|sepolia).`);
    const data = await graph.query<{ agentRegistrationFiles: AgentRegistrationRaw[] }>(
      subgraphId,
      AGENT_SEARCH_QUERY,
      { first },
    );
    for (const r of data.agentRegistrationFiles ?? []) {
      const agent = toDiscoveredAgent(chain, r, 0);
      if (!matchesCapability(agent, r.x402Support, opts.capability)) continue;
      out.push(agent);
    }
  }
  return out;
}

/**
 * Fetch a single agent profile by (chain, agentId).
 * @param chain Discovery chain key.
 * @param agentId Agent id (numeric string); profile id is "chainId:agentId".
 * @param opts Optional apiKey / offline flag.
 * @returns Normalized DiscoveredAgent with feedbackCount from the profile leg.
 */
export async function getAgentProfile(
  chain: DiscoverChain,
  agentId: string,
  opts: { apiKey?: string; offline?: boolean } = {},
): Promise<DiscoveredAgent> {
  const offline = opts.offline ?? process.env.AEGIS_OFFLINE === "1";
  if (offline) {
    const row = DISCOVER_OFFLINE_FIXTURE.find((r) => String(r.agentId) === String(agentId));
    if (!row) throw new Error("Agent not found on subgraph — check chain / agent id.");
    return toDiscoveredAgent(chain, row, 0);
  }
  const subgraphId = AGENT0_SUBGRAPHS[chain];
  if (!subgraphId) throw new Error(`Unknown discover chain "${chain}" (want base|eth|sepolia).`);
  const graph = new GraphClient({ apiKey: opts.apiKey, offline: false });
  // Search rows already report chain-prefixed ids ("8453:19669"); prefix only bare numeric ids.
  const id = String(agentId).includes(":") ? String(agentId) : `${DISCOVER_CHAIN_IDS[chain]}:${agentId}`;
  const data = await graph.query<{
    agent: {
      id: string;
      agentId?: string | number | null;
      registrationFile?: AgentRegistrationRaw | null;
      feedback?: { id: string }[] | null;
      validations?: { id: string }[] | null;
    } | null;
  }>(subgraphId, AGENT_PROFILE_QUERY, { id });
  if (!data.agent) throw new Error("Agent not found on subgraph — check chain / agent id.");
  const reg = data.agent.registrationFile ?? { agentId: data.agent.agentId };
  const feedbackCount = Array.isArray(data.agent.feedback) ? data.agent.feedback.length : 0;
  return toDiscoveredAgent(chain, reg, feedbackCount);
}

function rToX402(r: AgentRegistrationRaw): unknown {
  return r.x402Support;
}

function matchesCapability(agent: DiscoveredAgent, x402Raw: unknown, capability?: "mcp" | "x402"): boolean {
  void x402Raw; // x402 already normalized onto agent.x402Support
  if (capability === "mcp") return agent.mcpEndpoint !== "";
  if (capability === "x402") return agent.x402Support === true;
  return true;
}
