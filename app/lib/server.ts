// Server side helpers: local chain clients, deployment, ABIs, mock phone directory.
// Everything here runs against a LOCAL anvil chain. Keys are anvil dev keys.
import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
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
  bankId: Hex;
  bankName: string;
  bankBranch: string;
  certificates: Record<string, string>; // certificateId hash -> printed certificate number
  funds: FundInfo[];
  people: Person[];
  demoPhone: string;
  keys: { gov: Hex; bankSigner: Hex; bankOps: Hex; relayer: Hex; foreman: Hex };
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

export function publicClient() {
  return createPublicClient({ chain: foundry, transport: http(deployment().rpc), pollingInterval: 50 });
}

export function walletFor(key: Hex) {
  return createWalletClient({ account: privateKeyToAccount(key), chain: foundry, transport: http(deployment().rpc), pollingInterval: 50 });
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

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const MG = 10n ** 15n; // gold units per milligram
