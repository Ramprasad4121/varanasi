/** AEGIS agent public surface. */
export { GraphClient, KNOWN_SUBGRAPHS, STANDARD_POOL_QUERY, toPoolIntel, OFFLINE_FIXTURE } from "./graph.js";
export type { PoolIntel } from "./graph.js";
export { SubgraphAgent, McpClient, MCP_TOOLS, DEFAULT_SUBGRAPH_MCP } from "./mcp.js";
export { resolveAgentSubname, splitSubname, DEFAULT_UNIVERSAL_RESOLVER } from "./ens.js";
export type { AgentIdentity } from "./ens.js";
export { analyzeRisk, llmRationale, DEFAULT_THRESHOLD_BPS } from "./reason.js";
export type { ReasonInput, ReasonOutput } from "./reason.js";
export { payForSignal, hashscanTxUrl } from "./pay.js";
export type { PayResult } from "./pay.js";
