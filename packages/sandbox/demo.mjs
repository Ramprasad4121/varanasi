#!/usr/bin/env node
/**
 * @author Ramprasad
 * Varanasi sandbox demo: one command, the whole story, test money only.
 *
 *   cd packages && npm ci && npm run sandbox          # story in the terminal
 *   npm run sandbox:live                             # same, plus a live ledger page
 *   npm run sandbox:anvil                            # revoke also lands on a local anvil AegisRegistry
 *
 * Owner signs a mandate -> agent pays through the SDK and through the MCP
 * server -> gate allows within limits, blocks over limit -> ledger records
 * every step -> owner revokes -> next payment is blocked.
 *
 * Exits non-zero if any step does not behave as described, so CI runs it too.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AEGIS_REGISTRY_ABI, localSigner, OnchainBackend, Varanasi } from "@varanasi/sdk";

const args = new Set(process.argv.slice(2));
const SERVE = args.has("--serve");
const ANVIL = args.has("--anvil");
const PAUSE = SERVE ? 1500 : 0;

// Well known anvil dev keys. TEST ONLY: never fund these on a real network.
const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // gitleaks:allow public anvil dev key, test only
const AGENT = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"; // anvil account 1, acting as the AI agent
const TOKEN = "0x0000000000000000000000000000000000005d01"; // sandbox test token "tUSDC" (6 decimals)
const GPU_SHOP = "0x00000000000000000000000000000000000c0de1"; // sandbox payee
const OTHER_SHOP = "0x00000000000000000000000000000000000c0de2";
const DECIMALS = 6n;

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = c(1);
const green = c(32);
const red = c(31);
const yellow = c(33);
const dim = c(2);
const cyan = c(36);

const usd = (units) => {
  const u = BigInt(units);
  const whole = u / 10n ** DECIMALS;
  const frac = (u % 10n ** DECIMALS).toString().padStart(Number(DECIMALS), "0").slice(0, 2);
  return `${whole}.${frac} tUSDC`;
};
const tusdc = (n) => BigInt(Math.round(n * 100)) * 10n ** (DECIMALS - 2n);
const short = (a) => `${a.slice(0, 8)}...${a.slice(-4)}`;

let failures = 0;
function expect(cond, what) {
  if (!cond) {
    failures++;
    console.log(red(`   !! unexpected: ${what}`));
  }
}
function act(n, title) {
  console.log(`\n${bold(cyan(`Act ${n}.`))} ${bold(title)}`);
}
function show(label, d) {
  const verdict = d.allowed ? green("ALLOWED") : red(`BLOCKED (${d.code})`);
  const tail = d.allowed ? dim(`remaining ${usd(d.remaining)}`) : dim(d.reason);
  console.log(`   ${label.padEnd(44)} ${verdict}  ${tail}`);
}
const step = () => sleep(PAUSE);

console.log(bold("\nVaranasi sandbox: agents spend only inside limits their owner signed"));
console.log(yellow("SANDBOX: test money only. No real funds move."));

// ── optional local chain ──
let chain;
if (ANVIL) {
  const { startAnvilRegistry } = await import("./anvil.mjs");
  chain = await startAnvilRegistry({ ownerKey: OWNER_KEY, agent: AGENT });
  console.log(
    dim(
      `   anvil at ${chain.rpcUrl}, AegisRegistry ${chain.registry}, agent identity minted (tokenId ${chain.tokenId})`,
    ),
  );
}

const owner = localSigner(OWNER_KEY);
const sdk = chain
  ? new Varanasi({
      backend: new OnchainBackend({
        registry: chain.registry,
        reader: chain.publicClient,
        writer: chain.walletClient,
        ownerAccount: owner.address,
      }),
    })
  : Varanasi.sandbox();

// ── MCP server, spawned exactly as Claude Desktop or Cursor would ──
const { VARANASI_LEDGER_PORT: _port, ...childEnv } = process.env; // the demo serves the page itself
const mcp = new Client({ name: "varanasi-demo-agent", version: "0.1.0" });
await mcp.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../mcp-server/dist/index.js", import.meta.url))],
    env: { ...childEnv, VARANASI_SANDBOX_OWNER_KEY: OWNER_KEY },
    stderr: "ignore",
  }),
);
async function tool(name, a = {}) {
  const res = await mcp.callTool({ name, arguments: a });
  const data = JSON.parse(res.content[0].text);
  if (res.isError) throw new Error(`${name}: ${data.error}`);
  return data;
}

// ── optional live ledger page ──
let view;
if (SERVE) {
  const { serveLedgerView } = await import("../mcp-server/dist/ledger-view.js");
  view = await serveLedgerView(
    [
      {
        name: "SDK sandbox (in process)",
        read: async () => ({ entries: sdk.ledger.entries(), chainIntact: sdk.ledger.verify() === -1 }),
      },
      {
        name: "MCP server sandbox (what an AI agent sees)",
        read: async () => {
          const l = await tool("get_ledger");
          return { entries: l.entries, chainIntact: l.chainIntact };
        },
      },
    ],
    Number(process.env.VARANASI_LEDGER_PORT ?? 8787),
  );
  console.log(`\n   Live ledger: ${bold(view.url)}  ${dim("(open it now; steps pause so you can watch)")}`);
  await sleep(3000);
}

try {
  // Act 1
  act(1, "The owner signs a spend mandate for their agent (EIP-712, SDK)");
  const now = sdk.now();
  const mandate = await sdk.createMandate(
    {
      agent: AGENT,
      token: TOKEN,
      perTxCap: tusdc(5),
      totalCap: tusdc(20),
      validUntil: now + 86_400n,
      payees: [GPU_SHOP],
      categories: ["compute"],
    },
    owner,
  );
  console.log(`   owner ${short(owner.address)} signed for agent ${short(AGENT)}:`);
  console.log(`     up to ${usd(tusdc(5))} per payment, ${usd(tusdc(20))} in total, for 24 hours`);
  console.log(`     only to the GPU shop ${short(GPU_SHOP)}, only for "compute"`);
  console.log(dim(`     mandate id ${mandate.id}`));
  console.log(
    dim(`     signature recovers to the owner, bound to chain ${sdk.domain.chainId}; replay on another chain fails`),
  );
  await step();

  // Act 2
  act(2, "The agent pays through the SDK; the gate checks before money moves");
  const base = { agent: AGENT, payee: GPU_SHOP, token: TOKEN, category: "compute" };
  let d = await sdk.gate.spend({ ...base, paymentId: "sdk-1", amount: tusdc(4), memo: "40 GPU minutes" });
  show(`pay ${usd(tusdc(4))} to GPU shop`, d);
  expect(d.allowed, "4 tUSDC within limits should be allowed");
  await step();
  d = await sdk.gate.spend({ ...base, paymentId: "sdk-2", amount: tusdc(7.5) });
  show(`pay ${usd(tusdc(7.5))} to GPU shop`, d);
  expect(d.code === "OVER_PER_TX_CAP", "7.50 is over the 5.00 per-payment cap");
  await step();
  d = await sdk.gate.spend({ ...base, paymentId: "sdk-3", amount: tusdc(1), payee: OTHER_SHOP });
  show(`pay ${usd(tusdc(1))} to a shop not on the list`, d);
  expect(d.code === "PAYEE_NOT_ALLOWED", "unknown payee is blocked");
  await step();
  d = await sdk.gate.spend({ ...base, paymentId: "sdk-1", amount: tusdc(4) });
  show("replay the first payment (same paymentId)", d);
  expect(d.code === "DUPLICATE_PAYMENT", "replayed paymentId is blocked");
  await step();

  // Act 3
  act(3, "An AI agent does the same through the MCP server (Claude Desktop, Cursor)");
  const { tools } = await mcp.listTools();
  console.log(dim(`   connected over stdio; tools: ${tools.map((t) => t.name).join(", ")}`));
  const created = await tool("create_mandate", {
    agent: AGENT,
    token: TOKEN,
    perTxCap: tusdc(5).toString(),
    totalCap: tusdc(20).toString(),
    validForSeconds: 86_400,
    payees: [GPU_SHOP],
    categories: ["compute"],
  });
  console.log(
    `   create_mandate  -> signed by owner ${short(created.mandate.mandate.principal)}, id ${short(created.mandate.id)}`,
  );
  await step();
  const mpay = (paymentId, amount) => ({ ...base, paymentId, amount: amount.toString() });
  let m = await tool("check_payment", mpay("mcp-1", tusdc(3)));
  show(`check_payment  ${usd(tusdc(3))}`, m);
  expect(m.allowed, "MCP check within limits should be allowed");
  m = await tool("record_payment", { ...mpay("mcp-1", tusdc(3)), memo: "API credits" });
  show(`record_payment ${usd(tusdc(3))}`, m);
  expect(m.allowed, "MCP spend within limits should be allowed");
  await step();
  m = await tool("record_payment", mpay("mcp-2", tusdc(9)));
  show(`record_payment ${usd(tusdc(9))}`, m);
  expect(m.code === "OVER_PER_TX_CAP", "MCP over-limit is blocked");
  await step();

  // Act 4
  act(4, "The owner revokes the agent; it takes effect immediately");
  const r = await sdk.revoke(AGENT);
  console.log(`   SDK revoke(${short(AGENT)})   -> ${r.changed ? green("revoked") : "already revoked"}`);
  if (chain) {
    const lr = sdk.backend.lastRevoke;
    console.log(dim(`     AegisRegistry.revokeAgent(${lr?.tokenId}) tx ${lr?.txHash}`));
    expect(Boolean(lr?.txHash), "on-chain revoke tx sent");
    const live = await chain.publicClient.readContract({
      address: chain.registry,
      abi: AEGIS_REGISTRY_ABI,
      functionName: "isAuthorized",
      args: [AGENT],
    });
    console.log(dim(`     AegisRegistry.isAuthorized(agent) is now ${live}`));
    expect(live === false, "agent identity no longer authorized on chain");
  }
  const mr = await tool("revoke_agent", { agent: AGENT });
  console.log(`   MCP revoke_agent(${short(AGENT)}) -> ${mr.changed ? green("revoked") : "already revoked"}`);
  await step();
  d = await sdk.gate.spend({ ...base, paymentId: "sdk-4", amount: tusdc(1) });
  show(`SDK: pay ${usd(tusdc(1))} after revoke`, d);
  expect(d.code === "AGENT_REVOKED", "SDK payment after revoke is blocked");
  m = await tool("record_payment", mpay("mcp-3", tusdc(1)));
  show(`MCP: pay ${usd(tusdc(1))} after revoke`, m);
  expect(m.code === "AGENT_REVOKED", "MCP payment after revoke is blocked");
  await step();

  // Act 5
  act(5, "The ledger recorded every step (append-only, hash-chained)");
  const printLedger = (title, entries, intact) => {
    console.log(`   ${bold(title)}  ${intact ? green("hash chain intact") : red("HASH CHAIN BROKEN")}`);
    for (const e of entries) {
      const what =
        e.kind === "spend"
          ? green("paid    ")
          : e.kind === "spend_denied"
            ? red("blocked ")
            : e.kind === "check"
              ? cyan("checked ")
              : e.kind === "agent_revoked"
                ? red("revoked ")
                : cyan("mandate ");
      const amt = e.amount !== undefined ? usd(e.amount).padStart(12) : "".padStart(12);
      const code =
        e.kind === "mandate_created"
          ? dim("total cap")
          : e.code && e.code !== "OK"
            ? red(e.code)
            : e.kind === "check"
              ? green("OK")
              : "";
      console.log(`   ${String(e.seq).padStart(2)} ${what} ${amt}  ${code} ${dim(`${e.hash.slice(0, 12)}...`)}`);
    }
  };
  printLedger("SDK ledger", sdk.ledger.entries(), sdk.ledger.verify() === -1);
  expect(sdk.ledger.verify() === -1, "SDK ledger chain intact");
  const ml = await tool("get_ledger");
  printLedger("MCP ledger", ml.entries, ml.chainIntact);
  expect(ml.chainIntact, "MCP ledger chain intact");
  const sdkSpent = (await sdk.listMandates())[0].spent;
  console.log(
    `\n   Spent under the SDK mandate: ${usd(sdkSpent)} of ${usd(tusdc(20))}. Nothing moved outside the owner's limits.`,
  );
  expect(sdkSpent === tusdc(4), "only the allowed 4 tUSDC was counted");
} catch (e) {
  failures++;
  console.error(red(`demo error: ${e instanceof Error ? e.stack : e}`));
}

console.log(
  failures === 0
    ? green(bold("\nDemo complete: every step behaved as described."))
    : red(bold(`\n${failures} step(s) did not behave as described.`)),
);
console.log(yellow("Sandbox only. Test money. No real funds moved."));

if (SERVE && failures === 0) {
  console.log(`\n   Live ledger still running at ${bold(view.url)}. Press Ctrl+C to stop.`);
  const stop = async () => {
    view.server.close();
    await mcp.close();
    await chain?.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} else {
  view?.server.close();
  await mcp.close();
  await chain?.stop();
  process.exit(failures === 0 ? 0 : 1);
}
