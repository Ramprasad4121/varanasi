import { describe, expect, it } from "vitest";
import { encodeFrame, handle } from "./mcp-server.js";

describe("mcp-server", () => {
  it("initializes and lists tools", async () => {
    const init = (await handle({ jsonrpc: "2.0", id: 1, method: "initialize" })) as {
      result: { serverInfo: { name: string }; protocolVersion: string };
    };
    expect(init.result.serverInfo.name).toBe("varanasi");
    expect(init.result.protocolVersion).toBe("2024-11-05");
    const list = (await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" })) as {
      result: { tools: { name: string }[] };
    };
    expect(list.result.tools.map((t) => t.name)).toEqual(["list_agents", "get_agent", "run_job"]);
  });

  it("runs oracle via tools/call", async () => {
    const res = (await handle({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "run_job", arguments: { agent: "oracle", input: { symbol: "ETH/USDC" }, offline: true } },
    })) as { result: { content: { text: string }[]; isError: boolean } };
    const proof = JSON.parse(res.result.content[0].text) as { ok: boolean; agent: string; barPassed: boolean };
    expect(proof.ok).toBe(true);
    expect(proof.agent).toBe("oracle");
    expect(proof.barPassed).toBe(true);
    expect(res.result.isError).toBe(false);
  });

  it("encodes Content-Length frames", () => {
    const buf = encodeFrame({ jsonrpc: "2.0", id: 1, result: { ok: true } });
    const text = buf.toString("utf8");
    expect(text).toMatch(/^Content-Length: \d+\r\n\r\n\{/);
    const len = Number(text.match(/Content-Length: (\d+)/)?.[1]);
    const body = text.split("\r\n\r\n")[1];
    expect(Buffer.byteLength(body, "utf8")).toBe(len);
  });
});
