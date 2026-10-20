/**
 * API gate for /api/v1 routes that run agents or spend validator gas.
 * Author: Ramprasad
 *
 * Fail-closed: with no VARANASI_API_KEYS set, every gated call is refused.
 * Keys are compared as sha256 digests in constant time.
 * Local demo only: VARANASI_DEMO_OPEN=1 opens the gate (ignored on Vercel production).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { json } from "@/lib/api-cors";

const PAID_ROUTE = "POST https://varanasi-u2j5.onrender.com/v1/jobs (x402, $0.01)";

function digest(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

function allowedDigests(): Buffer[] {
  return (process.env.VARANASI_API_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length >= 24)
    .map(digest);
}

/** Returns null when the caller may proceed, or the refusal Response. */
export function requireApiKey(req: Request): Response | null {
  if (process.env.VARANASI_DEMO_OPEN === "1" && process.env.VERCEL_ENV !== "production") {
    return null;
  }
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  const keys = allowedDigests();
  if (m && keys.length > 0) {
    const got = digest(m[1].trim());
    if (keys.some((k) => timingSafeEqual(k, got))) return null;
  }
  return json(
    {
      ok: false,
      error: "payment or API key required",
      pay: PAID_ROUTE,
      hint: "send Authorization: Bearer <key>, or use the x402 route",
    },
    m ? 403 : 402,
  );
}
