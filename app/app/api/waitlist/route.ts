// Waitlist: POST adds one person (name, phone or email, city, interest, consent).
// GET lists entries for the team only (Authorization: Bearer $WAITLIST_ADMIN_TOKEN).
// Works in both the local demo (file) and the public demo (Upstash Redis on Vercel).
import { createHash, timingSafeEqual } from "node:crypto";
import { addEntry, listEntries, storeKind, validate } from "@/lib/waitlist";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Best effort only: on serverless each instance keeps its own counts.
const hits = new Map<string, { n: number; at: number }>();
function tooMany(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 10 * 60 * 1000) {
    hits.set(ip, { n: 1, at: now });
    return false;
  }
  h.n += 1;
  return h.n > 10;
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (tooMany(ip)) return json({ error: "WL_SLOW_DOWN" }, 429);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "WL_CONTACT" }, 400);
  }
  const { entry, error } = validate(body);
  if (error === "SPAM") return json({ ok: true, added: false }); // say nothing useful to bots
  if (!entry) return json({ error }, 400);
  try {
    const added = await addEntry(entry);
    return json({ ok: true, added });
  } catch (e) {
    const m = (e as Error).message;
    return json({ error: m === "WAITLIST_NOT_CONFIGURED" ? m : "STORE_DOWN" }, 503);
  }
}

export async function GET(req: Request) {
  const token = process.env.WAITLIST_ADMIN_TOKEN || "";
  const auth = req.headers.get("authorization") || "";
  const digest = (x: string) => createHash("sha256").update(x).digest();
  // constant time compare of equal length digests; short tokens are ignored
  if (token.length < 16 || !timingSafeEqual(digest(auth), digest(`Bearer ${token}`))) return json({ error: "NOT_FOUND" }, 404);
  try {
    const entries = await listEntries();
    return json({ store: storeKind(), count: entries.length, entries });
  } catch (e) {
    return json({ error: (e as Error).message }, 503);
  }
}
