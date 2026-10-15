/**
 * @author Ramprasad
 * Varanasi MCP server: exposes the agent permission layer to any MCP client
 * (Claude Desktop, Cursor, Claude Code) as tools, backed by the SDK sandbox.
 *
 * Tools: create_mandate, check_payment, record_payment, revoke_agent,
 * get_ledger, list_mandates, sandbox_info.
 *
 * SANDBOX, TEST MONEY ONLY. No money moves; record_payment is the gate's
 * atomic check-and-debit that a real payment rail would call first.
 */
import { randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  type Address,
  type Hex,
  type LedgerKind,
  localSigner,
  type MandateRecord,
  type MandateSigner,
  type Payment,
  signedMandateFromJson,
  signedMandateToJson,
  toJson,
  Varanasi,
} from "@varanasi/sdk";
import { z } from "zod";

export const SANDBOX_BANNER = "Varanasi sandbox: test money only. No real funds move.";

export interface ServerOptions {
  /** Defaults to a fresh in-memory sandbox. */
  varanasi?: Varanasi;
  /** Sandbox owner key used by create_mandate when no pre-signed mandate is passed. Random if omitted. */
  ownerKey?: Hex;
  /**
   * Let create_mandate sign with the sandbox owner key. Default true for the
   * sandbox. Set false so the server only accepts mandates the owner signed
   * elsewhere (what a real deployment must do: an agent must never hold the
   * owner's key).
   */
  allowSandboxSigning?: boolean;
}

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "0x-prefixed 20 byte hex address");
const amount = z
  .union([z.string().regex(/^[0-9]{1,78}$/, "base-10 integer string"), z.number().int().nonnegative()])
  .describe('Token base units, as a base-10 integer string (for example "5000000" is 5 test USDC with 6 decimals)');
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "32 byte hex");

const paymentShape = {
  paymentId: z.string().min(1).max(128).describe("Unique id for this payment; a paymentId is spent at most once"),
  agent: address.describe("Agent wallet making the payment"),
  payee: address.describe("Who gets paid"),
  token: address.describe("Test token address"),
  amount,
  category: z.string().max(64).optional().describe("Spend category, for example compute or api"),
  mandateId: bytes32.optional().describe("Pin a mandate; otherwise the first active mandate that allows it is used"),
  memo: z.string().max(280).optional().describe("Short note for the ledger. Never put secrets here."),
};

function text(value: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: toJson(value, 2) }], isError };
}

function fail(e: unknown) {
  return text({ error: e instanceof Error ? e.message : String(e), sandbox: SANDBOX_BANNER }, true);
}

function mandateView(r: MandateRecord, now: bigint) {
  const m = r.signed.mandate;
  const active = !r.revoked && now >= m.validFrom && now < m.validUntil && r.spent < m.totalCap;
  return {
    ...signedMandateToJson(r.signed),
    spent: r.spent.toString(),
    remaining: (m.totalCap - r.spent).toString(),
    revoked: r.revoked,
    active,
  };
}

/** Build the MCP server and its sandbox. */
export function createVaranasiMcpServer(opts: ServerOptions = {}) {
  const varanasi = opts.varanasi ?? Varanasi.sandbox();
  const ownerKey = opts.ownerKey ?? (`0x${randomBytes(32).toString("hex")}` as Hex);
  const owner: MandateSigner = localSigner(ownerKey);
  const allowSigning = opts.allowSandboxSigning ?? true;

  const server = new McpServer({ name: "varanasi-agent-permissions", version: "0.1.0" });

  server.registerTool(
    "sandbox_info",
    {
      title: "Sandbox info",
      description: "Describe this Varanasi sandbox: owner address, chain id, whether server-side signing is on.",
      inputSchema: {},
    },
    async () =>
      text({
        sandbox: SANDBOX_BANNER,
        owner: owner.address,
        chainId: varanasi.domain.chainId,
        domain: varanasi.domain,
        backend: varanasi.backend.kind,
        sandboxSigning: allowSigning,
        now: varanasi.now(),
      }),
  );

  server.registerTool(
    "create_mandate",
    {
      title: "Create spend mandate",
      description:
        "Owner grants an agent a signed EIP-712 spend limit (per-payment cap, total cap, expiry, allowed payees and categories). " +
        "Pass signedMandate to register one the owner signed elsewhere; otherwise the sandbox owner key signs it. Test money only.",
      inputSchema: {
        agent: address.optional().describe("Agent wallet the mandate is for"),
        token: address.optional().describe("Test token address"),
        perTxCap: amount.optional().describe("Max per payment, token base units"),
        totalCap: amount.optional().describe("Max total, token base units"),
        validForSeconds: z
          .number()
          .int()
          .positive()
          .max(31_622_400)
          .optional()
          .describe("Lifetime from now (default 86400)"),
        payees: z.array(address).max(64).optional().describe("Allowed payees; empty or omitted means any"),
        categories: z
          .array(z.string().max(64))
          .max(32)
          .optional()
          .describe("Allowed categories; empty or omitted means any"),
        nonce: amount.optional().describe("Replay nonce; random if omitted"),
        signedMandate: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("A mandate signed by the owner (JSON form from the SDK)"),
      },
    },
    async (a) => {
      try {
        if (a.signedMandate) {
          const rec = await varanasi.registerMandate(signedMandateFromJson(a.signedMandate));
          return text({ created: true, mandate: mandateView(rec, varanasi.now()), sandbox: SANDBOX_BANNER });
        }
        if (!allowSigning) {
          throw new Error(
            "SandboxSigningOff: this server only accepts signedMandate (owner signs on their own device)",
          );
        }
        if (!a.agent || !a.token || a.perTxCap === undefined || a.totalCap === undefined) {
          throw new Error("MissingFields: agent, token, perTxCap and totalCap are required");
        }
        const now = varanasi.now();
        const signed = await varanasi.createMandate(
          {
            agent: a.agent as Address,
            token: a.token as Address,
            perTxCap: a.perTxCap,
            totalCap: a.totalCap,
            validUntil: now + BigInt(a.validForSeconds ?? 86_400),
            payees: (a.payees ?? []) as Address[],
            categories: a.categories ?? [],
            ...(a.nonce !== undefined ? { nonce: a.nonce } : {}),
          },
          owner,
        );
        const rec = (await varanasi.backend.getMandate(signed.id)) as MandateRecord;
        return text({ created: true, mandate: mandateView(rec, varanasi.now()), sandbox: SANDBOX_BANNER });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "check_payment",
    {
      title: "Check payment",
      description:
        "Ask the gate whether a payment is allowed under the agent's mandate, before any money moves. Does not spend. Logged to the ledger.",
      inputSchema: paymentShape,
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async (a) => {
      try {
        return text({ ...(await varanasi.gate.check(a as Payment)), sandbox: SANDBOX_BANNER });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "record_payment",
    {
      title: "Record payment",
      description:
        "Atomic check and debit: if allowed, the amount is counted against the mandate and the paymentId is burned. " +
        "Call this immediately before moving money; if allowed is false, do not pay. Test money only.",
      inputSchema: paymentShape,
    },
    async (a) => {
      try {
        return text({ ...(await varanasi.gate.spend(a as Payment)), sandbox: SANDBOX_BANNER });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "revoke_agent",
    {
      title: "Revoke agent",
      description: "Revoke an agent immediately. Every mandate it holds stops working; the next payment is denied.",
      inputSchema: { agent: address.describe("Agent wallet to revoke") },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async (a) => {
      try {
        return text({ ...(await varanasi.revoke(a.agent as Address)), sandbox: SANDBOX_BANNER });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_ledger",
    {
      title: "Get ledger",
      description: "Read the append-only, hash-chained ledger of every mandate, check, spend, denial and revoke.",
      inputSchema: {
        agent: address.optional(),
        mandateId: bytes32.optional(),
        kind: z
          .enum(["mandate_created", "check", "spend", "spend_denied", "agent_revoked", "mandate_revoked"])
          .optional(),
        sinceSeq: z.number().int().nonnegative().optional(),
        limit: z.number().int().positive().max(1000).optional().describe("Return at most this many (latest) entries"),
      },
      annotations: { readOnlyHint: true },
    },
    async (a) => {
      try {
        const filter: { agent?: Hex; mandateId?: Hex; kind?: LedgerKind; sinceSeq?: number } = {};
        if (a.agent) filter.agent = a.agent as Hex;
        if (a.mandateId) filter.mandateId = a.mandateId as Hex;
        if (a.kind) filter.kind = a.kind;
        if (a.sinceSeq !== undefined) filter.sinceSeq = a.sinceSeq;
        const all = varanasi.ledger.entries(filter);
        const entries = a.limit ? all.slice(-a.limit) : all;
        return text({
          entries,
          total: varanasi.ledger.size(),
          head: varanasi.ledger.head(),
          chainIntact: varanasi.ledger.verify() === -1,
          sandbox: SANDBOX_BANNER,
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_mandates",
    {
      title: "List mandates",
      description: "List mandates with spent, remaining, revoked and active status.",
      inputSchema: { agent: address.optional(), activeOnly: z.boolean().optional() },
      annotations: { readOnlyHint: true },
    },
    async (a) => {
      try {
        const now = varanasi.now();
        const list = await varanasi.listMandates({
          ...(a.agent ? { agent: a.agent as Address } : {}),
          ...(a.activeOnly ? { activeOnly: true } : {}),
        });
        return text({ mandates: list.map((r) => mandateView(r, now)), sandbox: SANDBOX_BANNER });
      } catch (e) {
        return fail(e);
      }
    },
  );

  return { server, varanasi, owner };
}
