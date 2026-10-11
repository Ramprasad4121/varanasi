// The relayer: submits the member's signed request and pays the gas.
import { json, localOnly, refused } from "@/lib/server";
import { execute, reasonOf, type ForwardMessage } from "@/lib/relay";
import type { Hex } from "viem";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: Request) {
  const off = localOnly(req);
  if (off) return off;
  const { message, signature } = (await req.json()) as { message: ForwardMessage; signature: Hex };
  try {
    const hash = await execute(message, signature);
    return json({ ok: true, ref: hash });
  } catch (e) {
    const m = (e as Error)?.message || "";
    return m === "TARGET_NOT_ALLOWED" ? json({ error: m }, 400) : refused(reasonOf(e));
  }
}
