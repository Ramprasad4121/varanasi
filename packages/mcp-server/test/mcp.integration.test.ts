/**
 * Spawns the built MCP server over stdio (the way Claude Desktop or Cursor
 * would) and calls every tool. Run `npm run build` first (npm test does).
 */
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { localSigner, signedMandateToJson, signMandate, spendMandateDomain, Varanasi } from "@varanasi/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serveLedgerView } from "../src/ledger-view.js";

const SERVER = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // gitleaks:allow public anvil dev key, test only
const OWNER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const AGENT = "0x00000000000000000000000000000000000a6e01";
const AGENT2 = "0x00000000000000000000000000000000000a6e02";
const TOKEN = "0x0000000000000000000000000000000000005d01";
const PAYEE = "0x00000000000000000000000000000000000b0b01";

let client: Client;

// biome-ignore lint/suspicious/noExplicitAny: tool results are JSON text
async function call(name: string, args: Record<string, unknown> = {}): Promise<{ data: any; isError: boolean }> {
  const res = (await client.callTool({ name, arguments: args })) as {
    content: { type: string; text: string }[];
    isError?: boolean;
  };
  const first = res.content[0];
  return { data: JSON.parse(first?.text ?? "null"), isError: Boolean(res.isError) };
}

const pay = (paymentId: string, amount: string, extra: Record<string, unknown> = {}) => ({
  paymentId,
  agent: AGENT,
  payee: PAYEE,
  token: TOKEN,
  amount,
  ...extra,
});

beforeAll(async () => {
  client = new Client({ name: "varanasi-test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [SERVER],
      env: { ...process.env, VARANASI_SANDBOX_OWNER_KEY: OWNER_KEY } as Record<string, string>,
      stderr: "ignore",
    }),
  );
});

afterAll(async () => {
  await client?.close();
});

describe("varanasi MCP server (stdio)", () => {
  it("lists every tool", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "check_payment",
        "create_mandate",
        "get_ledger",
        "list_mandates",
        "record_payment",
        "revoke_agent",
        "sandbox_info",
      ].sort(),
    );
  });

  it("sandbox_info reports the test-only owner and chain", async () => {
    const { data } = await call("sandbox_info");
    expect(data.owner).toBe(OWNER);
    expect(data.chainId).toBe("31337");
    expect(data.sandbox).toMatch(/test money only/);
  });

  it("runs the full flow through every tool", async () => {
    const created = await call("create_mandate", {
      agent: AGENT,
      token: TOKEN,
      perTxCap: "5000000",
      totalCap: "8000000",
      validForSeconds: 3600,
      categories: ["compute"],
    });
    expect(created.isError).toBe(false);
    const mandateId = created.data.mandate.id as string;
    expect(created.data.mandate.mandate.principal).toBe(OWNER);

    const check = await call("check_payment", pay("m1", "4000000", { category: "compute" }));
    expect(check.data).toMatchObject({ allowed: true, code: "OK", mandateId, remaining: "4000000" });

    const paid = await call("record_payment", pay("m1", "4000000", { category: "compute", memo: "GPU minutes" }));
    expect(paid.data).toMatchObject({ allowed: true, remaining: "4000000" });

    const replay = await call("record_payment", pay("m1", "4000000", { category: "compute" }));
    expect(replay.data.code).toBe("DUPLICATE_PAYMENT");

    const over = await call("record_payment", pay("m2", "6000000", { category: "compute" }));
    expect(over.data).toMatchObject({ allowed: false, code: "OVER_PER_TX_CAP" });

    const overTotal = await call("record_payment", pay("m3", "4000001", { category: "compute" }));
    expect(overTotal.data.code).toBe("OVER_TOTAL_CAP");

    const wrongCat = await call("check_payment", pay("m4", "1", { category: "travel" }));
    expect(wrongCat.data.code).toBe("CATEGORY_NOT_ALLOWED");

    const listed = await call("list_mandates", { agent: AGENT });
    expect(listed.data.mandates[0]).toMatchObject({ spent: "4000000", remaining: "4000000", active: true });

    const revoked = await call("revoke_agent", { agent: AGENT });
    expect(revoked.data.changed).toBe(true);
    const after = await call("record_payment", pay("m5", "1", { category: "compute" }));
    expect(after.data).toMatchObject({ allowed: false, code: "AGENT_REVOKED" });

    const active = await call("list_mandates", { activeOnly: true });
    expect(active.data.mandates).toHaveLength(0);

    const ledger = await call("get_ledger", {});
    expect(ledger.data.chainIntact).toBe(true);
    expect(ledger.data.entries.map((e: { kind: string }) => e.kind)).toEqual([
      "mandate_created",
      "check",
      "spend",
      "spend_denied",
      "spend_denied",
      "spend_denied",
      "check",
      "agent_revoked",
      "spend_denied",
    ]);
    const spends = await call("get_ledger", { kind: "spend" });
    expect(spends.data.entries).toHaveLength(1);
    expect(spends.data.entries[0].memo).toBe("GPU minutes");
  });

  it("registers a mandate the owner signed elsewhere", async () => {
    const v = Varanasi.sandbox();
    const signed = await signMandate(
      { agent: AGENT2, token: TOKEN, perTxCap: 10n, totalCap: 10n, validUntil: v.now() + 600n },
      localSigner(OWNER_KEY),
      { domain: spendMandateDomain() },
    );
    const res = await call("create_mandate", { signedMandate: signedMandateToJson(signed) });
    expect(res.isError).toBe(false);
    expect(res.data.mandate.id).toBe(signed.id);
    const again = await call("create_mandate", { signedMandate: signedMandateToJson(signed) });
    expect(again.isError).toBe(true);
    expect(again.data.error).toMatch(/DuplicateMandate/);
    const forged = signedMandateToJson(signed);
    forged.mandate.totalCap = "1000";
    const bad = await call("create_mandate", { signedMandate: forged });
    expect(bad.isError).toBe(true);
    expect(bad.data.error).toMatch(/BadId|BadCaps/);
  });

  it("returns clear errors for bad input", async () => {
    const res = await call("create_mandate", { agent: AGENT });
    expect(res.isError).toBe(true);
    expect(res.data.error).toMatch(/MissingFields/);
    const bad = await client.callTool({ name: "check_payment", arguments: { ...pay("x", "-5") } });
    expect(bad.isError).toBe(true);
  });
});

describe("live ledger page", () => {
  it("serves the page and the ledger json", async () => {
    const v = Varanasi.sandbox();
    const { server, url } = await serveLedgerView([
      { name: "test", read: async () => ({ entries: v.ledger.entries(), chainIntact: true }) },
    ]);
    try {
      const html = await (await fetch(url)).text();
      expect(html).toContain("TEST MONEY ONLY");
      const json = await (await fetch(`${url}ledger.json`)).json();
      expect(json).toEqual([{ name: "test", entries: [], chainIntact: true }]);
    } finally {
      server.close();
    }
  });
});
