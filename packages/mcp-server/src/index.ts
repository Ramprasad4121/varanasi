#!/usr/bin/env node
/**
 * @author Ramprasad
 * stdio entry point for the Varanasi MCP server. Sandbox, test money only.
 *
 * Env:
 *   VARANASI_SANDBOX_OWNER_KEY  test-only owner key for server-side signing (random if unset)
 *   VARANASI_SANDBOX_SIGNING=0  only accept mandates the owner signed elsewhere
 *   VARANASI_LEDGER_PORT=8787   also serve the live ledger page on 127.0.0.1
 *
 * stdout carries MCP JSON-RPC only; logs go to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Hex } from "@varanasi/sdk";
import { serveLedgerView } from "./ledger-view.js";
import { createVaranasiMcpServer, SANDBOX_BANNER } from "./server.js";

const key = process.env.VARANASI_SANDBOX_OWNER_KEY;
const { server, varanasi, owner } = createVaranasiMcpServer({
  ...(key ? { ownerKey: key as Hex } : {}),
  allowSandboxSigning: process.env.VARANASI_SANDBOX_SIGNING !== "0",
});

await server.connect(new StdioServerTransport());
process.stderr.write(`[varanasi-mcp] ${SANDBOX_BANNER} owner=${owner.address} chainId=${varanasi.domain.chainId}\n`);

const port = process.env.VARANASI_LEDGER_PORT;
if (port) {
  const { url } = await serveLedgerView(
    [
      {
        name: "MCP sandbox",
        read: async () => ({ entries: varanasi.ledger.entries(), chainIntact: varanasi.ledger.verify() === -1 }),
      },
    ],
    Number(port),
  );
  process.stderr.write(`[varanasi-mcp] live ledger: ${url}\n`);
}
