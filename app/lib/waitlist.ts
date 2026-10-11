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
import { createHash } from "node:crypto";
import type { Entry } from "./waitlist-rules";
export { validate, type Entry, type Interest } from "./waitlist-rules";

const ENTRIES = "varanasi:waitlist:entries";
const KEYS = "varanasi:waitlist:contacts";

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
