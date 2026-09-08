import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildMinimalMcpEnv,
  DEFAULT_SUBGRAPH_MCP,
  MCP_ENV_ALLOWLIST,
  SUBGRAPH_MCP_PACKAGE,
  SUBGRAPH_MCP_VERSION,
} from "./mcp.js";

let savedPath: string | undefined;
let savedKey: string | undefined;

beforeEach(() => {
  savedPath = process.env.PATH;
  savedKey = process.env.GRAPH_API_KEY;
});

afterEach(() => {
  if (savedPath === undefined) delete process.env.PATH;
  else process.env.PATH = savedPath;
  if (savedKey === undefined) delete process.env.GRAPH_API_KEY;
  else process.env.GRAPH_API_KEY = savedKey;
});

describe("minimal MCP env", () => {
  it("pins the server package version (no floating npx latest)", () => {
    expect(SUBGRAPH_MCP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(DEFAULT_SUBGRAPH_MCP.args?.join(" ")).toContain(`${SUBGRAPH_MCP_PACKAGE}@${SUBGRAPH_MCP_VERSION}`);
  });

  it("forwards PATH + allowlist only, never parent secrets", () => {
    process.env.PATH = "/usr/bin:/bin";
    process.env.GRAPH_API_KEY = "k";
    process.env.HEDERA_AGENT_PRIVATE_KEY = "super-secret";
    process.env.LLM_API_KEY = "super-secret";
    process.env.OWNER_PRIVATE_KEY = "super-secret";
    const env = buildMinimalMcpEnv({ GRAPH_API_KEY: "k" });
    expect(env.PATH).toBe("/usr/bin:/bin");
    expect(env.GRAPH_API_KEY).toBe("k");
    expect(JSON.stringify(env)).not.toContain("super-secret");
    for (const k of Object.keys(env)) {
      expect([...MCP_ENV_ALLOWLIST]).toContain(k);
    }
    delete (process.env as Record<string, string | undefined>).HEDERA_AGENT_PRIVATE_KEY;
    delete (process.env as Record<string, string | undefined>).LLM_API_KEY;
    delete (process.env as Record<string, string | undefined>).OWNER_PRIVATE_KEY;
  });

  it("refuses to spawn without PATH", () => {
    delete process.env.PATH;
    expect(() => buildMinimalMcpEnv({})).toThrow("PATH is unset");
  });
});
