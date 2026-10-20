// Waitlist test. Part 1 checks the form rules and both stores in-process (local file,
// and the Upstash Redis REST path against a small FAKE Upstash server started here).
// Part 2 (when APP is set) calls the running app's /api/waitlist, which app-public.sh
// starts with KV_REST_API_URL pointing at the same fake server. No real Upstash, no
// account, nothing leaves this computer.
// Usage: [APP=http://127.0.0.1:3200] FAKE_KV_PORT=18700 WAITLIST_ADMIN_TOKEN=... \
//        node --import ./scripts/ts-hook.mjs scripts/waitlist-test.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.FAKE_KV_PORT || 18700);
const TOKEN = "fake-upstash-token-for-tests";
const ADMIN = process.env.WAITLIST_ADMIN_TOKEN || "local-test-admin-token-0123456789";
let failures = 0;
let passes = 0;
const ok = (c, m) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${m}`);
  c ? passes++ : failures++;
};

// ---- fake Upstash (scripts/fake-upstash.mjs): app-public.sh may already run one on PORT
const { startFakeUpstash } = await import("./fake-upstash.mjs");
const server = process.env.FAKE_KV_RUNNING ? null : await startFakeUpstash(PORT, TOKEN);

const good = { name: "Test Person", contact: "98765 43210", city: "Mahabubnagar", interest: "gold", consent: true, lang: "te" };
const { validate } = await import("../lib/waitlist-rules.ts");

// ---- rules
ok(validate(good).entry?.contact === "9876543210", "valid phone accepted and cleaned to 10 digits");
ok(validate({ ...good, contact: "+91 98765-43210" }).entry?.contact === "9876543210", "+91 prefix and dashes accepted");
ok(validate({ ...good, contact: "Ram@Example.COM" }).entry?.contactType === "email", "email accepted, lower cased");
ok(validate({ ...good, contact: "12345" }).error === "WL_CONTACT", "bad contact refused (WL_CONTACT)");
ok(validate({ ...good, name: "A" }).error === "WL_NAME", "one letter name refused (WL_NAME)");
ok(validate({ ...good, consent: false }).error === "WL_CONSENT", "no consent refused (WL_CONSENT)");
ok(validate({ ...good, interest: "crypto" }).error === "WL_INTEREST", "unknown interest refused (WL_INTEREST)");
ok(validate({ ...good, website: "http://spam" }).error === "SPAM", "hidden field filled -> treated as a bot");
ok(validate(good).entry?.updates === false, "weekly update is off unless ticked");
ok(
  validate({ ...good, updates: true }).entry?.updates === true && validate({ ...good, updates: "yes" }).entry?.updates === false,
  "weekly update only on an explicit tick (true), not on any other value"
);

// ---- file store (local demo)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wl-"));
process.env.WAITLIST_FILE = path.join(tmp, "waitlist.jsonl");
delete process.env.KV_REST_API_URL;
delete process.env.VERCEL;
const W = await import("../lib/waitlist.ts");
ok(W.storeKind() === "file", "off Vercel with no Redis: local file store");
const e1 = validate(good).entry;
ok((await W.addEntry(e1)) === true && (await W.addEntry(e1)) === false, "file: added once, duplicate contact not added twice");
process.env.VERCEL = "1";
ok(W.storeKind() === "none", "on Vercel with no Redis: not configured (nothing pretended saved)");
let threw = "";
try {
  await W.addEntry(e1);
} catch (e) {
  threw = e.message;
}
ok(threw === "WAITLIST_NOT_CONFIGURED", "not configured -> WAITLIST_NOT_CONFIGURED");

// ---- Upstash REST path
process.env.KV_REST_API_URL = `http://127.0.0.1:${PORT}`;
process.env.KV_REST_API_TOKEN = TOKEN;
ok(W.storeKind() === "redis", "with KV_REST_API_URL + token: Upstash store");
const e2 = validate({ ...good, contact: "anitha@example.com" }).entry;
ok((await W.addEntry(e2)) === true && (await W.addEntry(e2)) === false, "Upstash: added once, duplicate refused by SADD");
ok(
  (await W.listEntries()).some((x) => x.contact === "anitha@example.com"),
  "Upstash: entry listed"
);
process.env.KV_REST_API_TOKEN = "wrong";
threw = "";
try {
  await W.addEntry({ ...e2, contact: "x@example.com" });
} catch (e) {
  threw = e.message;
}
ok(threw === "STORE_DOWN", "Upstash rejects a bad token -> STORE_DOWN, not a fake success");
process.env.KV_REST_API_TOKEN = TOKEN;

// ---- weekly update opt out (unsubscribe link with an HMAC token)
delete process.env.WAITLIST_UNSUB_SECRET;
ok(W.unsubscribePath("anitha@example.com") === "", "no secret set: no unsubscribe link is offered");
process.env.WAITLIST_UNSUB_SECRET = process.env.TEST_UNSUB_SECRET || "local-test-unsub-secret-0123456789";
const e3 = validate({ ...good, contact: "lakshmi@example.com", updates: true }).entry;
await W.addEntry(e3);
const link = new URL("http://x" + W.unsubscribePath("lakshmi@example.com"));
const ck = link.searchParams.get("c");
const tk = link.searchParams.get("t");
ok(
  W.checkUnsubscribe(ck, tk) && !W.checkUnsubscribe(ck, "0".repeat(64)) && !W.checkUnsubscribe(W.contactKey("other@example.com"), tk),
  "unsubscribe token works only for its own contact"
);
ok((await W.listEntriesForUpdates()).find((x) => x.contact === "lakshmi@example.com")?.updates === true, "opted in before unsubscribing");
await W.unsubscribe(ck);
await W.unsubscribe(ck);
ok(
  (await W.listEntriesForUpdates()).find((x) => x.contact === "lakshmi@example.com")?.updates === false,
  "after unsubscribe (twice, idempotent): updates off, still on the waitlist"
);

// ---- the running app (public mode, pointed at the fake Upstash)
const APP = process.env.APP;
if (APP) {
  const post = (b, ip = "10.0.0.1") =>
    fetch(APP + "/api/waitlist", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(b) }).then(
      async (r) => ({ status: r.status, j: await r.json() })
    );
  let r = await post({ ...good, contact: "90000 11111" });
  ok(r.status === 200 && r.j.added === true, "API: join waitlist -> added");
  r = await post({ ...good, contact: "90000 11111" });
  ok(r.status === 200 && r.j.added === false, "API: same phone again -> not added twice");
  r = await post({ ...good, contact: "nope" });
  ok(r.status === 400 && r.j.error === "WL_CONTACT", "API: bad contact -> 400 WL_CONTACT");
  r = await post({ ...good, website: "x" });
  ok(r.status === 200 && r.j.added === false, "API: bot field -> quiet no-op");
  const list = await fetch(APP + "/api/waitlist").then((x) => x.status);
  ok(list === 404, "API: list without admin token -> 404");
  const wrong = await fetch(APP + "/api/waitlist", { headers: { authorization: "Bearer wrong-token-wrong-token" } }).then((x) => x.status);
  ok(wrong === 404, "API: list with wrong token -> 404");
  const admin = await fetch(APP + "/api/waitlist", { headers: { authorization: `Bearer ${ADMIN}` } }).then((x) => x.json());
  ok(admin.store === "redis" && admin.entries.some((x) => x.contact === "9000011111"), "API: admin list from the Upstash store");
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await post({ ...good, contact: `9${String(100000000 + i)}` }, "10.9.9.9")).status;
  ok(last === 429, "API: more than 10 joins in 10 minutes from one address -> 429 (per instance only)");
  r = await post({ ...good, contact: "ravi.updates@example.com", updates: true }, "10.0.0.2");
  const adm2 = await fetch(APP + "/api/waitlist", { headers: { authorization: `Bearer ${ADMIN}` } }).then((x) => x.json());
  ok(
    r.j.added === true && adm2.entries.find((x) => x.contact === "ravi.updates@example.com")?.updates === true,
    "API: weekly update opt in stored with the signup"
  );
  const bad = await fetch(APP + "/api/waitlist/unsubscribe?c=" + W.contactKey("ravi.updates@example.com") + "&t=" + "0".repeat(64)).then((x) => x.status);
  ok(bad === 400, "API: unsubscribe with a wrong token -> 400, nothing changed");
  const goodLink = await fetch(APP + W.unsubscribePath("ravi.updates@example.com")).then(async (x) => ({ s: x.status, t: await x.text() }));
  const adm3 = await fetch(APP + "/api/waitlist", { headers: { authorization: `Bearer ${ADMIN}` } }).then((x) => x.json());
  ok(
    goodLink.s === 200 && goodLink.t.includes("weekly update") && adm3.entries.find((x) => x.contact === "ravi.updates@example.com")?.updates === false,
    "API: unsubscribe link -> plain confirmation page, updates off"
  );
  const local = await fetch(APP + "/api/state?addr=0x0000000000000000000000000000000000000001").then((x) => x.status);
  ok(local === 404, "API: local chain routes answer 404 in public mode");
}

server?.close();
console.log(failures ? `\n${failures} check(s) failed, ${passes} passed` : `\nall ${passes} checks passed`);
process.exit(failures ? 1 : 0);
