// The relayer: submits the member's signed request and pays the gas.
import { json } from "@/lib/server";
import { execute, reasonOf, type ForwardMessage } from "@/lib/relay";
import type { Hex } from "viem";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { message, signature } = (await req.json()) as { message: ForwardMessage; signature: Hex };
  try {
    const hash = await execute(message, signature);
    return json({ ok: true, ref: hash });
  } catch (e) {
    const m = (e as Error)?.message || "";
    return json({ error: m === "TARGET_NOT_ALLOWED" ? m : reasonOf(e) }, 400);
  }
}
