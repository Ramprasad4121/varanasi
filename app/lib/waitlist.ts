// Waitlist storage. One entry per contact (phone or email), kept somewhere durable:
//   1. Upstash Redis over its REST API, when KV_REST_API_URL + KV_REST_API_TOKEN (the
//      names Vercel's Upstash integration sets) or UPSTASH_REDIS_REST_URL +
//      UPSTASH_REDIS_REST_TOKEN are present. Works on Vercel (serverless).
//   2. A local JSON-lines file (runtime/waitlist.jsonl, or WAITLIST_FILE) when the app
//      runs on a computer (local demo). Never used on Vercel: its disk is not kept.
//   3. Otherwise "not configured": the form says the waitlist is not open yet and
//      nothing is pretended to be saved.
import fs from "node:fs";
import path from "node:path";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Entry } from "./waitlist-rules";
export { validate, type Entry, type Interest } from "./waitlist-rules";

const ENTRIES = "varanasi:waitlist:entries";
const KEYS = "varanasi:waitlist:contacts";
const UNSUB = "varanasi:waitlist:unsubscribed";

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function storeKind(): "redis" | "file" | "none" {
  if (redisConfig()) return "redis";
  if (!process.env.VERCEL) return "file";
  return "none";
}

function filePath() {
  return process.env.WAITLIST_FILE || path.join(process.env.VARANASI_RUNTIME || path.join(process.cwd(), "runtime"), "waitlist.jsonl");
}

async function redis(commands: (string | number)[][]): Promise<any[]> {
  const c = redisConfig()!;
  const r = await fetch(`${c.url}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  if (!r.ok) throw new Error("STORE_DOWN");
  const out = (await r.json()) as { result?: unknown; error?: string }[];
  if (out.some((x) => x.error)) throw new Error("STORE_DOWN");
  return out.map((x) => x.result);
}

/** Normalised contact, so the same person is not added twice. */
export function contactKey(contact: string) {
  return createHash("sha256").update(contact.trim().toLowerCase()).digest("hex");
}

/** Returns true when added, false when this contact was already on the list. */
export async function addEntry(e: Entry): Promise<boolean> {
  const key = contactKey(e.contact);
  const kind = storeKind();
  if (kind === "redis") {
    const [added] = await redis([["SADD", KEYS, key]]);
    if (Number(added) !== 1) return false;
    await redis([["RPUSH", ENTRIES, JSON.stringify(e)]]);
    return true;
  }
  if (kind === "file") {
    const f = filePath();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const existing = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
    for (const line of existing.split("\n")) {
      if (!line.trim()) continue;
      try {
        if (contactKey(JSON.parse(line).contact) === key) return false;
      } catch {
        /* skip a damaged line */
      }
    }
    fs.appendFileSync(f, JSON.stringify(e) + "\n");
    return true;
  }
  throw new Error("WAITLIST_NOT_CONFIGURED");
}

export async function listEntries(): Promise<Entry[]> {
  const kind = storeKind();
  if (kind === "redis") {
    const [rows] = await redis([["LRANGE", ENTRIES, 0, -1]]);
    return ((rows as string[]) || []).map((r) => JSON.parse(r));
  }
  if (kind === "file") {
    const f = filePath();
    if (!fs.existsSync(f)) return [];
    return fs
      .readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
  }
  throw new Error("WAITLIST_NOT_CONFIGURED");
}

// ---- weekly update opt out. The link in every update carries the contact key and an
// HMAC of it made with WAITLIST_UNSUB_SECRET (server only), so nobody can unsubscribe
// someone else by guessing. Without the secret, unsubscribe links are not offered.
function unsubSecret() {
  const s = process.env.WAITLIST_UNSUB_SECRET || "";
  return s.length >= 16 ? s : "";
}

/** Token for the unsubscribe link of `contact`, or "" when no secret is set. */
export function unsubscribeToken(contact: string): string {
  const s = unsubSecret();
  return s ? createHmac("sha256", s).update(contactKey(contact)).digest("hex") : "";
}

/** Path to put in a weekly update, e.g. /api/waitlist/unsubscribe?c=...&t=... */
export function unsubscribePath(contact: string): string {
  const t = unsubscribeToken(contact);
  return t ? `/api/waitlist/unsubscribe?c=${contactKey(contact)}&t=${t}` : "";
}

export function checkUnsubscribe(key: string, token: string): boolean {
  const s = unsubSecret();
  if (!s || !/^[0-9a-f]{64}$/.test(key) || !/^[0-9a-f]{64}$/.test(token)) return false;
  const want = createHmac("sha256", s).update(key).digest();
  return timingSafeEqual(want, Buffer.from(token, "hex"));
}

function unsubFile() {
  return filePath().replace(/\.jsonl$/, "") + "-unsubscribed.txt";
}

/** Records the opt out. Idempotent. */
export async function unsubscribe(key: string): Promise<void> {
  const kind = storeKind();
  if (kind === "redis") {
    await redis([["SADD", UNSUB, key]]);
    return;
  }
  if (kind === "file") {
    const f = unsubFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const have = fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n") : [];
    if (!have.includes(key)) fs.appendFileSync(f, key + "\n");
    return;
  }
  throw new Error("WAITLIST_NOT_CONFIGURED");
}

async function unsubscribedKeys(): Promise<Set<string>> {
  const kind = storeKind();
  if (kind === "redis") {
    const [rows] = await redis([["SMEMBERS", UNSUB]]);
    return new Set((rows as string[]) || []);
  }
  if (kind === "file") {
    const f = unsubFile();
    return new Set(fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean) : []);
  }
  return new Set();
}

/** Entries with `updates` turned off for anyone who unsubscribed. */
export async function listEntriesForUpdates(): Promise<Entry[]> {
  const [all, off] = await Promise.all([listEntries(), unsubscribedKeys()]);
  return all.map((e) => ({ ...e, updates: !!e.updates && !off.has(contactKey(e.contact)) }));
}
