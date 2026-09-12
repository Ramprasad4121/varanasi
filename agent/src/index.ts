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
export {
  AGENT0_SUBGRAPHS,
  DEFAULT_DISCOVER_CHAINS,
  DISCOVER_CHAIN_IDS,
  AGENT_SEARCH_QUERY,
  AGENT_PROFILE_QUERY,
  DISCOVER_OFFLINE_FIXTURE,
  toDiscoveredAgent,
  searchAgents,
  getAgentProfile,
} from "./discover.js";
export type { DiscoverChain, DiscoveredAgent, AgentRegistrationRaw, SearchAgentsOptions } from "./discover.js";
export { SCOUT_MIN_TURNOVER, turnoverOf, pickScoutTarget, normalizeSignal, runScout } from "./workers/scout.js";
export type { ScoutGraph, ScoutPayFn, ScoutOptions, ScoutResult } from "./workers/scout.js";
export { buildAnalystBrief, analyzePool, runAnalyst } from "./workers/analyst.js";
export type { AnalystAlpha, AnalystOptions, AnalystResult } from "./workers/analyst.js";
export { decideFreelancerAction, runFreelancer } from "./workers/freelancer.js";
export type { FreelancerAction, FreelancerResult, FreelancerOptions, FreelancerDeps } from "./workers/freelancer.js";
export {
  AaveMcpClient,
  AAVE_MCP_URL_DEFAULT,
  AAVE_MCP_PROTOCOL_VERSION,
  AAVE_REQUEST_TIMEOUT_MS,
  AAVE_TOOLS,
  AAVE_OFFLINE_FIXTURE,
  toMarketSnapshot,
  toWalletSummary,
  extractRows,
  parseSseData,
} from "./aave.js";
export type { AaveToolName, AaveFetch, AaveClientOptions, MarketSnapshot, WalletSummary, PreviewResult } from "./aave.js";

/** Finance decision engine: deterministic demo recommendations + mandates. */
export {
  DEMO_FINANCE_SOURCE,
  demoFinanceSource,
  recommend,
  buildMandate,
  execute,
  prepareOnchain,
  publicClient,
} from "./finance/finance.js";
export type { FinanceWallet, FinanceSource, FinanceOptions } from "./finance/finance.js";
export type {
  ChitPoolState,
  CollateralPosition,
  FinancialMandate,
  FinancialReceipt,
  FinancialRecommendation,
  GoldPosition,
  LoanState,
  ReputationScores,
  SavingsVaultState,
} from "./finance/types.js";
export type {
  Address,
  Hash,
  Hex,
  ChitPoolConfig,
  ChitPoolStatus,
  ChitRoundResult,
  GoldPositionStatus,
  LoanParams,
  LoanStatus,
  MandateType,
  RecommendationAction,
  ReputationProfile,
  SavingsVaultConfig,
} from "./finance/types.js";
