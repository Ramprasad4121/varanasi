#!/usr/bin/env node
/**
 * CLI: `aegis analyze --agent <subname> --pool <id> [--vault] [--offline] [--skip-pay]`
 *
 * Orchestrates: ENS resolve → Graph intel → pay x402 → reason → RiskGuard
 * read-only check → JSON output with receipts.
 */
import { Command } from "commander";
import "dotenv/config";
import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";
import { GraphClient } from "./graph.js";
import { SubgraphAgent } from "./mcp.js";
import { resolveAgentSubname } from "./ens.js";
import { analyzeRisk, DEFAULT_THRESHOLD_BPS } from "./reason.js";
import { payForSignal } from "./pay.js";

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
program.name("aegis").description("AEGIS agent — Graph intel + x402 alpha + ENS identity").version("0.1.0");

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

      // 4. Reason (pure heuristic, no LLM key)
      const verdict = analyzeRisk(
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
            mode: { graph: graph.mode, mcp: useMcp ? "preferred-with-gateway-fallback" : "gateway-direct" },
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

program.parseAsync(process.argv);
