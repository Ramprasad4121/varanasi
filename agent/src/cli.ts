#!/usr/bin/env node
/**
 * @author Ramprasad — `aegis analyze|revoke|mandate` orchestration (ENS → Graph → x402 → reason → RiskGuard; env: GRAPH_API_KEY, SEPOLIA_RPC_URL, AEGIS_REGISTRY, RISK_GUARD, HEDERA_*, SIGNAL_URL).
 * CLI: `aegis analyze --agent <subname> --pool <id> [--vault] [--offline] [--skip-pay]`
 *
 * Orchestrates: ENS resolve → Graph intel → pay x402 → reason → RiskGuard
 * read-only check → JSON output with receipts.
 */
import { Command } from "commander";
import "dotenv/config";
import { createPublicClient, createWalletClient, http, keccak256, toHex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { GraphClient } from "./graph.js";
import { SubgraphAgent } from "./mcp.js";
import { resolveAgentSubname } from "./ens.js";
import { analyzeRisk, DEFAULT_THRESHOLD_BPS } from "./reason.js";
import { reasonWithLLM } from "./brain.js";
import { payForSignal } from "./pay.js";
import {
  SEPOLIA_CHAIN_ID,
  TASK_ESCROW_ADDRESS,
  mandateDomain,
  mandateToJson,
  randomNonce,
  sepoliaAddressUrl,
  signMandate,
  type Mandate,
} from "./mandate.js";

const RISKGUARD_ABI = [
  {
    type: "function",
    name: "authorize",
    stateMutability: "view",
    inputs: [
      { name: "agent", type: "address" },
      { name: "riskScoreBps", type: "uint256" },
      { name: "maxAllowedBps", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const program = new Command();
program.name("aegis").description("varanasi agent — Graph intel + x402 alpha + ENS identity").version("0.1.0");

program
  .command("analyze")
  .description("Analyze a pool/vault: ENS → Graph → x402 → reason → RiskGuard → JSON")
  .requiredOption("--agent <subname>", "agent subname, e.g. agent-1.aegis.eth")
  .requiredOption("--pool <id>", "pool/pair id on the subgraph")
  .option("--pair", "query the Uniswap V2 subgraph (pair/pairs) instead of Uniswap V3")
  .option("--vault", "deprecated alias for --pair (V2 pairs leg)")
  .option("--subgraph <id>", "override subgraph id")
  .option("--offline", "fixture mode (no network Graph call; tests only)")
  .option("--skip-pay", "skip the x402 payment leg (reason over Graph intel only)")
  .option("--no-mcp", "skip local MCP server, use direct Gateway")
  .option("--threshold <bps>", "risk threshold in bps", String(DEFAULT_THRESHOLD_BPS))
  .option("--llm", "opt-in LLM reasoning via brain.ts (fallback: heuristic); default off")
  .action(async (opts) => {
    const started = Date.now();
    const thresholdBps = Number(opts.threshold);
    const useMcp = opts.mcp !== false;
    const offline = Boolean(opts.offline);
    try {
      // 1. ENS identity
      const identity = await resolveAgentSubname(opts.agent);

      // 2. Graph intel (MCP-first, Gateway fallback; live unless --offline)
      const graph = new GraphClient({ offline });
      const subgraphs = new SubgraphAgent(graph);
      let intel;
      try {
        intel = opts.pair || opts.vault
          ? await graph.pairIntel(opts.pool, opts.subgraph)
          : await graph.poolIntel(opts.pool, opts.subgraph);
      } finally {
        subgraphs.disconnect();
      }
      void useMcp; // MCP discovery path exercised via SubgraphAgent.runQuery in live integrations

      // 3. x402 alpha (paid leg)
      let alpha: { score: number; direction: "long" | "short" | "neutral"; receipt: unknown } = {
        score: 0,
        direction: "neutral",
        receipt: { paid: false, skipped: true },
      };
      if (!opts.skipPay) {
        const paid = await payForSignal({}, { agent: identity.agentWallet, pool: intel.poolId });
        const p = paid.payload as any;
        // Service shape: { signal: 'LONG'|'SHORT'|'NEUTRAL', confidence: 0..1 }.
        const dirRaw = String(p?.direction ?? p?.signal ?? "neutral").toLowerCase();
        const direction = dirRaw === "long" || dirRaw === "short" ? dirRaw : ("neutral" as const);
        const conf = Number(p?.confidence ?? 0);
        const signed = direction === "short" ? -conf : direction === "long" ? conf : 0;
        alpha = {
          score: Number(p?.alphaScore ?? p?.score ?? signed),
          direction,
          receipt: { paid: paid.paid, txHash: paid.txHash, hashscanUrl: paid.hashscanUrl },
        };
      }

      // 4. Reason (pure heuristic by default; --llm opts into brain.ts with heuristic fallback)
      const useLlm = Boolean(opts.llm);
      const verdict = useLlm
        ? await reasonWithLLM(
            { tvlUsd: intel.tvlUsd, volume24hUsd: intel.volume24hUsd, fees24hUsd: intel.fees24hUsd },
            { score: alpha.score, direction: alpha.direction },
            { authorized: identity.authorized },
            thresholdBps,
          )
        : analyzeRisk(
            {
              tvlUsd: intel.tvlUsd,
              volume24hUsd: intel.volume24hUsd,
              fees24hUsd: intel.fees24hUsd,
              alphaScore: alpha.score,
              alphaDirection: alpha.direction,
              identityOk: identity.authorized,
            },
            thresholdBps,
          );

      // 5. RiskGuard read-only check (static call — never sends a tx)
      let guard: { address: string | null; wouldPass: boolean | null; error: string | null } = {
        address: null,
        wouldPass: null,
        error: null,
      };
      const guardAddr = process.env.RISK_GUARD as Address | undefined;
      if (guardAddr) {
        guard.address = guardAddr;
        try {
          const c = createPublicClient({
            chain: sepolia,
            transport: http(process.env.SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org"),
          });
          await c.readContract({
            address: guardAddr,
            abi: RISKGUARD_ABI,
            functionName: "authorize",
            args: [identity.agentWallet, BigInt(verdict.riskScoreBps), BigInt(thresholdBps)],
          });
          guard.wouldPass = true;
        } catch (e: any) {
          guard.wouldPass = false;
          guard.error = String(e?.shortMessage ?? e?.message ?? e).slice(0, 300);
        }
      }

      console.log(
        JSON.stringify(
          {
            ok: true,
            mode: { graph: graph.mode, mcp: useMcp ? "preferred-with-gateway-fallback" : "gateway-direct", reason: useLlm ? "llm-with-heuristic-fallback" : "heuristic" },
            agent: {
              name: identity.name,
              wallet: identity.agentWallet,
              authorized: identity.authorized,
              revoked: identity.revoked,
              expiry: identity.expiry.toString(),
              ens: identity.mode,
              ensMatchesRegistry: identity.ensMatchesRegistry,
            },
            intel: {
              subgraph: intel.subgraphId,
              pool: intel.poolId,
              name: intel.name,
              symbols: intel.symbols,
              tvlUsd: intel.tvlUsd,
              volume24hUsd: intel.volume24hUsd,
              fees24hUsd: intel.fees24hUsd,
            },
            alpha,
            verdict,
            guard,
            thresholdBps,
            elapsedMs: Date.now() - started,
          },
          null,
          2,
        ),
      );
    } catch (e: any) {
      console.error(JSON.stringify({ ok: false, error: String(e?.message ?? e).slice(0, 500) }));
      process.exitCode = 1;
    }
  });

const REVOKE_ABI = [
  {
    type: "function",
    name: "tokenByLabelHash",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "agentOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "isAuthorized",
    stateMutability: "view",
    inputs: [{ name: "agentWallet", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "revokeAgentByLabel",
    stateMutability: "nonpayable",
    inputs: [{ name: "sublabel", type: "string" }],
    outputs: [],
  },
] as const;

program
  .command("revoke")
  .description("Revoke an agent subname: prints isAuthorized before/after")
  .requiredOption("--label <sublabel>", "agent sublabel, e.g. sentinel-1")
  .action(async (opts) => {
    try {
      const registry = process.env.AEGIS_REGISTRY as Address | undefined;
      if (!registry) throw new Error("AEGIS_REGISTRY is not set.");
      const pk = process.env.OWNER_PRIVATE_KEY ?? process.env.AEGIS_OWNER_KEY;
      if (!pk) throw new Error("OWNER_PRIVATE_KEY is not set (human owner key).");
      const label = String(opts.label).toLowerCase().trim();
      const rpc = process.env.SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org";
      const pub = createPublicClient({ chain: sepolia, transport: http(rpc) });
      const tokenId = (await pub.readContract({
        address: registry,
        abi: REVOKE_ABI,
        functionName: "tokenByLabelHash",
        args: [keccak256(toHex(label))],
      })) as bigint;
      const agent = (await pub.readContract({
        address: registry,
        abi: REVOKE_ABI,
        functionName: "agentOf",
        args: [tokenId],
      })) as Address;
      const before = (await pub.readContract({
        address: registry,
        abi: REVOKE_ABI,
        functionName: "isAuthorized",
        args: [agent],
      })) as boolean;
      console.log(JSON.stringify({ label, tokenId: tokenId.toString(), agent, isAuthorizedBefore: before }));
      const account = privateKeyToAccount(pk as `0x${string}`);
      const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpc) });
      const txHash = await wallet.writeContract({
        address: registry,
        abi: REVOKE_ABI,
        functionName: "revokeAgentByLabel",
        args: [label],
      });
      console.log(JSON.stringify({ txHash }));
      await pub.waitForTransactionReceipt({ hash: txHash });
      const after = (await pub.readContract({
        address: registry,
        abi: REVOKE_ABI,
        functionName: "isAuthorized",
        args: [agent],
      })) as boolean;
      console.log(JSON.stringify({ isAuthorizedAfter: after, ok: true }, null, 2));
    } catch (e: unknown) {
      console.error(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 500) }));
      process.exitCode = 1;
    }
  });

program
  .command("mandate")
  .description("Create + EIP-712 sign a TaskEscrow mandate (offline — prints digest + explorer-ready fields, never broadcasts)")
  .requiredOption("--agent <address>", "agent wallet (identity re-checked live via RiskGuard at release)")
  .requiredOption("--merchant <address>", "payee on release (single-merchant scope)")
  .requiredOption("--token <address>", "ERC20 token (USDC-first; no ETH path exists)")
  .requiredOption("--cap <base-units>", "max escrowed amount, token base units")
  .requiredOption("--window-start <unix>", "validation window open (block.timestamp clock)")
  .requiredOption("--window-end <unix>", "validation window close (inclusive)")
  .requiredOption("--expiry <unix>", "refund gate: refund iff block.timestamp > expiry")
  .requiredOption("--private-key <hex>", "payer signing key (used once in memory, never stored or logged)")
  .option("--nonce <uint>", "per-signer replay nullifier (default: fresh random uint256)")
  .option("--chain-id <id>", "EIP-712 + mandate chain id", String(SEPOLIA_CHAIN_ID))
  .option("--escrow <address>", "TaskEscrow deployment (domain verifyingContract)", TASK_ESCROW_ADDRESS)
  .action(async (opts) => {
    try {
      const escrow = String(opts.escrow) as Address;
      const chainId = Number(opts.chainId);
      const mandate: Mandate = {
        agent: String(opts.agent) as Address,
        merchant: String(opts.merchant) as Address,
        token: String(opts.token) as Address,
        cap: BigInt(String(opts.cap)),
        windowStart: BigInt(String(opts.windowStart)),
        windowEnd: BigInt(String(opts.windowEnd)),
        expiry: BigInt(String(opts.expiry)),
        nonce: opts.nonce !== undefined ? BigInt(String(opts.nonce)) : randomNonce(),
        chainId: BigInt(chainId),
      };
      const signed = await signMandate(mandate, String(opts.privateKey) as `0x${string}`, {
        verifyingContract: escrow,
        chainId,
      });
      console.log(
        JSON.stringify(
          {
            ok: true,
            broadcast: false,
            mandate: mandateToJson(signed.mandate),
            domain: { ...mandateDomain({ verifyingContract: escrow, chainId }), chainId },
            structHash: signed.structHash,
            digest: signed.digest,
            taskId: signed.taskId,
            signature: signed.signature,
            signer: signed.signer,
            escrow,
            explorer: {
              escrowUrl: sepoliaAddressUrl(escrow),
              agentUrl: sepoliaAddressUrl(signed.mandate.agent),
              merchantUrl: sepoliaAddressUrl(signed.mandate.merchant),
              tokenUrl: sepoliaAddressUrl(signed.mandate.token),
              note: "fund with escrow.fund(mandate, sig) from ANY submitter after the SIGNER approves(token, escrow, cap); track by taskId on the escrow contract page.",
            },
          },
          null,
          2,
        ),
      );
    } catch (e: unknown) {
      console.error(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 500) }));
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
