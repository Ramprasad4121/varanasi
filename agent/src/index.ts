/**
 * @author Ramprasad — varanasi agent public surface (re-exports graph, mcp, ens, reason, pay, mandate, escrow; no env reads).
 * varanasi agent public surface.
 */
export {
  GraphClient,
  KNOWN_SUBGRAPHS,
  CURATED_POOLS,
  UNISWAP_POOL_QUERY,
  UNISWAP_POOL_LIST_QUERY,
  UNISWAP_V2_PAIR_QUERY,
  STANDARD_POOL_QUERY,
  toPoolIntel,
  isSanePool,
  MAX_SANE_TVL_USD,
  OFFLINE_FIXTURE,
} from "./graph.js";
export type { PoolIntel, UniswapPoolRaw } from "./graph.js";
export {
  SubgraphAgent,
  McpClient,
  MCP_TOOLS,
  DEFAULT_SUBGRAPH_MCP,
  SUBGRAPH_MCP_PACKAGE,
  SUBGRAPH_MCP_VERSION,
  MCP_ENV_ALLOWLIST,
  buildMinimalMcpEnv,
} from "./mcp.js";
export { resolveAgentSubname, splitSubname, isIdentityAuthorized, DEFAULT_UNIVERSAL_RESOLVER } from "./ens.js";
export type { AgentIdentity } from "./ens.js";
export { analyzeRisk, llmRationale, DEFAULT_THRESHOLD_BPS } from "./reason.js";
export type { ReasonInput, ReasonOutput } from "./reason.js";
export { reasonWithLLM, isAllowedLlmBaseUrl, isLocalBaseUrl, escapeHtml } from "./brain.js";
export { payForSignal, hashscanTxUrl, derivePaidReceipt, isValidHederaTxId, isAllowedSignalUrl } from "./pay.js";
export type { PayResult, DerivedReceipt } from "./pay.js";
export { runDoctor, formatDoctor, SEPOLIA_CHAIN_ID_DEC, SEPOLIA_CHAIN_ID_HEX } from "./doctor.js";
export type { DoctorCheck, DoctorOptions } from "./doctor.js";
export {
  TASK_ESCROW_ADDRESS,
  RISK_GUARD_ADDRESS,
  LIVE_THRESHOLD_BPS,
  SEPOLIA_CHAIN_ID,
  MAX_EXPIRY_WINDOW_SEC,
  MANDATE_DOMAIN_NAME,
  MANDATE_DOMAIN_VERSION,
  MANDATE_TYPE_STRING,
  MANDATE_TYPEHASH,
  MANDATE_TYPES,
  mandateDomain,
  validateMandate,
  mandateStructHash,
  mandateDigest,
  mandateTaskId,
  signMandate,
  verifyMandate,
  addressFromPrivateKey,
  addressFromPublicKey,
  randomNonce,
  timeNonce,
  mandateToJson,
  mandateFromJson,
  sepoliaAddressUrl,
  sepoliaTxUrl,
} from "./mandate.js";
export type { Mandate, MandateDomainOpts, MandateSanityOpts, SignedMandate } from "./mandate.js";
export {
  DEFAULT_SEPOLIA_RPC_URL,
  ERC20_ABI,
  TASK_ESCROW_ABI,
  TASK_STATES,
  makeEscrowClient,
  taskState,
  readTask,
  isNonceUsed,
  readThresholdBps,
  fundMandate,
  submitValidation,
  releaseTask,
  refundTask,
  cancelTask,
} from "./escrow.js";
export type { EscrowWallet, EscrowOptions, EscrowTask, FundResult, TaskStateLabel } from "./escrow.js";
