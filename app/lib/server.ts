// Server side helpers: local chain clients, deployment, ABIs, mock phone directory.
// Everything here runs against a LOCAL anvil chain. Keys are anvil dev keys.
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, http, keccak256, toHex, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

export type Person = { name: string; nameTe: string; phone: string; address: Address };
export type FundInfo = { address: Address; name: string; nameTe: string; foreman: string };
export type Deployment = {
  rpc: string;
  chainId: number;
  forwarder: Address;
  goldToken: Address;
  issuer: Address;
  registry: Address;
  priceFeed: Address;
  rupee: Address;
  vault: Address;
  loans: Address;
  lender: Address;
  seededAt: number;
  bankId: Hex;
  bankName: string;
  bankBranch: string;
  certificates: Record<string, string>; // certificateId hash -> printed certificate number
  funds: FundInfo[];
  people: Person[];
  demoPhone: string;
  keys: { gov: Hex; bankSigner: Hex; bankOps: Hex; relayer: Hex; foreman: Hex; lender: Hex };
};

export const RUNTIME_DIR = process.env.VARANASI_RUNTIME || path.join(process.cwd(), "runtime");

export function deployment(): Deployment {
  const f = path.join(RUNTIME_DIR, "deployment.json");
  if (!fs.existsSync(f)) throw new Error("NOT_DEPLOYED");
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

export function saveDeployment(d: Deployment) {
  fs.writeFileSync(path.join(RUNTIME_DIR, "deployment.json"), JSON.stringify(d, null, 2));
}

let _abis: Record<string, Abi> | null = null;
export function abi(name: string): Abi {
  if (!_abis) _abis = JSON.parse(fs.readFileSync(path.join(RUNTIME_DIR, "abis.json"), "utf8"));
  const a = _abis![name];
  if (!a) throw new Error("missing abi " + name);
  return a;
}

// Never let Next.js cache a chain read: its fetch cache would otherwise keep JSON-RPC
// answers (even across restarts, in .next/cache/fetch-cache) and show stale balances.
const rpc = () => http(deployment().rpc, { fetchOptions: { cache: "no-store" } });

export function publicClient() {
  return createPublicClient({ chain: foundry, transport: rpc(), pollingInterval: 50 });
}

export function walletFor(key: Hex) {
  return createWalletClient({ account: privateKeyToAccount(key), chain: foundry, transport: rpc(), pollingInterval: 50 });
}

/** MOCK phone sign-in: a phone number maps to a device key. A real launch uses an
 *  embedded key held on the phone (or a passkey) after an SMS OTP from a licensed
 *  provider; the server never knows the key. */
export function keyForPhone(phone: string): Hex {
  return keccak256(toHex("varanasi-local-demo:" + normalizePhone(phone)));
}

export function normalizePhone(p: string) {
  const d = p.replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

export function addressForPhone(phone: string): Address {
  return privateKeyToAccount(keyForPhone(phone)).address;
}

export function personFor(addr: string): Person | undefined {
  return deployment().people.find((p) => p.address.toLowerCase() === addr.toLowerCase());
}

/** The chain routes exist only in the LOCAL demo. A public (hosted) build runs its
 *  demo ledger in the browser and must never look for a local chain. */
export function localOnly(req?: Request): Response | null {
  // Off unless the build is explicitly the local chain demo, and always off on Vercel:
  // these routes hand out mock device keys and move demo money, so a deploy with no
  // mode set (or a wrong one on Vercel) must never serve them.
  const off = process.env.NEXT_PUBLIC_VARANASI_MODE !== "local" || !!process.env.VERCEL;
  if (off) return json({ error: "PUBLIC_DEMO_NO_CHAIN" }, 404);
  // Self hosted: answer only when the browser reached this computer by a local name
  // (localhost, 127.0.0.1, ::1), so a local demo exposed on a network by mistake does
  // not hand out keys or move demo money. ALLOW_DEMO_ROUTES=1 opens them on purpose
  // (docker compose, where the smoke test calls http://app:3100).
  if (req && process.env.ALLOW_DEMO_ROUTES !== "1" && !isLocalHost(req.headers.get("host"))) {
    return json({ error: "PUBLIC_DEMO_NO_CHAIN" }, 404);
  }
  return null;
}

export function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  const h = host.trim().toLowerCase();
  const name = h.startsWith("[") ? h.slice(1, h.indexOf("]")) : h.split(":")[0];
  return name === "localhost" || name === "127.0.0.1" || name === "::1";
}

/** A refusal the person can act on (a contract rule, a wrong code, a bad amount)
 *  comes back as 200 with { error: CODE }, so the screen shows it in plain words and
 *  the browser console stays clean. Only a broken setup (chain down, not deployed,
 *  unknown failure) is a 5xx. Malformed requests (BAD_ADDRESS) stay 400. */
export function refused(code: string): Response {
  return json({ error: code }, ["CHAIN_DOWN", "NOT_DEPLOYED", "UNKNOWN"].includes(code) ? 503 : 200);
}

export function json(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    {
      status,
      headers: { "content-type": "application/json" },
    }
  );
}

export const MG = 10n ** 15n; // gold units per milligram
