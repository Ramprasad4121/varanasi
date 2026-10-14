/**
 * @author Ramprasad
 * Tiny live ledger page. Zero dependencies: node:http serves one HTML page
 * that polls /ledger.json every second. Binds to 127.0.0.1 only.
 * Sandbox, test money only.
 */
import { createServer, type Server } from "node:http";
import { type LedgerEntry, toJson } from "@varanasi/sdk";

/** One ledger to show (the demo shows the SDK sandbox and the MCP sandbox side by side). */
export interface LedgerSource {
  name: string;
  read: () => Promise<{ entries: LedgerEntry[]; chainIntact: boolean }>;
}

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Varanasi sandbox ledger</title>
<style>
body{font:14px/1.45 system-ui,sans-serif;margin:0;background:#0f1115;color:#e8e8e8}
header{padding:16px 20px;border-bottom:1px solid #2a2d34}
h1{font-size:18px;margin:0}.tag{display:inline-block;margin-top:6px;padding:2px 8px;border-radius:4px;background:#3a2f00;color:#ffd666;font-weight:600}
section{padding:12px 20px}h2{font-size:15px;margin:14px 0 6px}
table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border-bottom:1px solid #22252b;text-align:left;vertical-align:top}
th{color:#9aa0aa;font-weight:500}.ok{color:#7ee787}.no{color:#ff7b72}.info{color:#79c0ff}.mono{font-family:ui-monospace,monospace;font-size:12px;color:#9aa0aa}
</style></head><body>
<header><h1>Varanasi agent permissions: live ledger</h1><span class="tag">SANDBOX: TEST MONEY ONLY</span></header>
<section id="root">Loading...</section>
<script>
const label={mandate_created:["Mandate signed","info"],check:["Checked","info"],spend:["Paid (allowed)","ok"],spend_denied:["Blocked","no"],agent_revoked:["Agent revoked","no"],mandate_revoked:["Mandate revoked","no"]};
const short=s=>s?String(s).slice(0,10)+"...":"";
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
async function tick(){
  try{
    const r=await fetch("ledger.json",{cache:"no-store"});const data=await r.json();
    document.getElementById("root").innerHTML=data.map(src=>{
      const rows=src.entries.map(e=>{const [t,c]=label[e.kind]||[e.kind,""];
        const status=e.kind==="check"?(e.code==="OK"?"would be allowed":"would be blocked: "+e.code):(e.code&&e.code!=="OK"?e.code:"");
        return "<tr><td>"+e.seq+"</td><td class='"+c+"'>"+esc(t)+"</td><td>"+esc(e.amount??"")+"</td><td class='mono'>"+esc(short(e.agent))+"</td><td class='mono'>"+esc(short(e.payee))+"</td><td>"+esc(status)+"</td><td>"+esc(e.reason)+"</td><td class='mono'>"+esc(short(e.hash))+"</td></tr>"}).join("");
      return "<h2>"+esc(src.name)+" <span class='"+(src.chainIntact?"ok":"no")+"'>"+(src.chainIntact?"hash chain intact":"HASH CHAIN BROKEN")+"</span></h2><table><tr><th>#</th><th>Event</th><th>Amount</th><th>Agent</th><th>Payee</th><th>Status</th><th>Reason</th><th>Hash</th></tr>"+rows+"</table>"}).join("");
  }catch(e){document.getElementById("root").textContent="Waiting for sandbox..."}
}
tick();setInterval(tick,1000);
</script></body></html>`;

/** Start the page. Returns the server and its URL. */
export async function serveLedgerView(sources: LedgerSource[], port = 0): Promise<{ server: Server; url: string }> {
  const server = createServer(async (req, res) => {
    if (req.url === "/ledger.json") {
      const data = await Promise.all(sources.map(async (s) => ({ name: s.name, ...(await s.read()) })));
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(toJson(data));
      return;
    }
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
      });
      res.end(PAGE);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const addr = server.address();
  const actual = typeof addr === "object" && addr ? addr.port : port;
  return { server, url: `http://127.0.0.1:${actual}/` };
}
