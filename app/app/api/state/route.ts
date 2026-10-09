import { isAddress } from "viem";
import { json } from "@/lib/server";
import { reasonOf } from "@/lib/relay";
import { stateFor } from "@/lib/state";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const addr = new URL(req.url).searchParams.get("addr") || "";
  if (!isAddress(addr)) return json({ error: "BAD_ADDRESS" }, 400);
  try {
    return json(await stateFor(addr));
  } catch (e) {
    return json({ error: reasonOf(e) }, 503);
  }
}
