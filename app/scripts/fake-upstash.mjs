// A tiny FAKE of the Upstash Redis REST API (/pipeline with SADD, RPUSH, LRANGE) for
// local tests only. No real Upstash account is used anywhere in the tests.
// Run alone: node scripts/fake-upstash.mjs [port]   (token: fake-upstash-token-for-tests)
import http from "node:http";

export function startFakeUpstash(port, token = "fake-upstash-token-for-tests") {
  const sets = new Map();
  const lists = new Map();
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      if (req.headers.authorization !== `Bearer ${token}` || req.url !== "/pipeline") {
        res.writeHead(401).end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      let cmds;
      try {
        cmds = JSON.parse(body);
      } catch {
        res.writeHead(400).end(JSON.stringify({ error: "bad json" }));
        return;
      }
      const out = cmds.map(([cmd, key, ...a]) => {
        if (cmd === "SADD") {
          const s = sets.get(key) || new Set();
          sets.set(key, s);
          const had = s.has(a[0]);
          s.add(a[0]);
          return { result: had ? 0 : 1 };
        }
        if (cmd === "RPUSH") {
          const l = lists.get(key) || [];
          lists.set(key, l);
          l.push(a[0]);
          return { result: l.length };
        }
        if (cmd === "LRANGE") return { result: lists.get(key) || [] };
        return { error: "unknown command" };
      });
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out));
    });
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] || process.env.FAKE_KV_PORT || 18700);
  await startFakeUpstash(port);
  console.log(`fake Upstash on http://127.0.0.1:${port}`);
}
