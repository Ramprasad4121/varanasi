// MOCK phone sign-in. Any 10 digit number works; the code is always 123456.
// Real launch: SMS OTP from a licensed provider, and the key is created and kept
// on the phone (never sent by a server). See docs/APP.md "What is mocked".
import { privateKeyToAccount } from "viem/accounts";
import { json, keyForPhone, localOnly, normalizePhone, personFor, refused } from "@/lib/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: Request) {
  const off = localOnly();
  if (off) return off;
  const { phone, code } = (await req.json()) as { phone?: string; code?: string };
  const p = normalizePhone(phone || "");
  if (p.length !== 10) return refused("BAD_PHONE");
  if (code !== undefined && code !== "123456") return refused("BAD_CODE");
  if (code === undefined) return json({ sent: true });
  const key = keyForPhone(p);
  const address = privateKeyToAccount(key).address;
  let person = null;
  try {
    person = personFor(address) || null;
  } catch {
    person = null;
  }
  return json({ key, address, phone: p, name: person?.name || "", nameTe: person?.nameTe || "" });
}
