// Gasless relay (ERC-2771). The member's device signs a ForwardRequest; the relayer
// key submits it and pays the gas. The forwarder checks signature, nonce and
// deadline, so the relayer cannot change a request or act for anyone else.
import { BaseError, ContractFunctionRevertedError, encodeFunctionData, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { abi, deployment, publicClient, walletFor } from "./server";

export const FORWARD_TYPES = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
    { name: "data", type: "bytes" },
  ],
} as const;

export type Call = { to: Address; abiName: string; functionName: string; args: readonly unknown[] };
export type ForwardMessage = {
  from: Address;
  to: Address;
  value: string;
  gas: string;
  nonce: string;
  deadline: number;
  data: Hex;
};

export function domain() {
  const d = deployment();
  return { name: "Varanasi Relayer", version: "1", chainId: d.chainId, verifyingContract: d.forwarder };
}

/** Plain reason from a revert: the custom error name, or "UNKNOWN". */
export function reasonOf(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) return r.data?.errorName || r.reason || "UNKNOWN";
  }
  const m = String((e as Error)?.message || e);
  if (m.includes("NOT_DEPLOYED")) return "NOT_DEPLOYED";
  if (m.includes("fetch failed") || m.includes("ECONNREFUSED")) return "CHAIN_DOWN";
  return "UNKNOWN";
}

/** Dry run the call as the member (eth_call from their address) so a bad action
 *  fails here with its real reason, before anything is signed or sent. */
export async function simulateAs(from: Address, c: Call) {
  await publicClient().simulateContract({
    account: from,
    address: c.to,
    abi: abi(c.abiName),
    functionName: c.functionName,
    args: c.args as unknown[],
  });
}

export async function prepare(from: Address, c: Call): Promise<ForwardMessage> {
  await simulateAs(from, c);
  const d = deployment();
  const pub = publicClient();
  const nonce = (await pub.readContract({
    address: d.forwarder,
    abi: abi("VaranasiForwarder"),
    functionName: "nonces",
    args: [from],
  })) as bigint;
  const now = Number((await pub.getBlock()).timestamp);
  return {
    from,
    to: c.to,
    value: "0",
    gas: "700000",
    nonce: nonce.toString(),
    deadline: now + 3600,
    data: encodeFunctionData({ abi: abi(c.abiName), functionName: c.functionName, args: c.args as unknown[] }),
  };
}

export function allowedTargets(): Address[] {
  const d = deployment();
  return [d.issuer, d.goldToken, d.rupee, ...d.funds.map((f) => f.address)].map((a) => a.toLowerCase() as Address);
}

/** Relayer submits a signed request through the forwarder. */
export async function execute(m: ForwardMessage, signature: Hex): Promise<Hex> {
  if (!allowedTargets().includes(m.to.toLowerCase() as Address)) throw new Error("TARGET_NOT_ALLOWED");
  const d = deployment();
  const wallet = walletFor(d.keys.relayer);
  const hash = await wallet.writeContract({
    address: d.forwarder,
    abi: abi("VaranasiForwarder"),
    functionName: "execute",
    args: [
      {
        from: m.from,
        to: m.to,
        value: BigInt(m.value),
        gas: BigInt(m.gas),
        deadline: m.deadline,
        data: m.data,
        signature,
      },
    ],
  });
  const r = await publicClient().waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("RELAY_FAILED");
  return hash;
}

/** Demo helper: act as a demo member whose key the server derives (other members
 *  of the demo chit, and the bank counter). Same signed path as a real member. */
export async function relayAs(key: Hex, c: Call): Promise<Hex> {
  const account = privateKeyToAccount(key);
  const m = await prepare(account.address, c);
  const signature = await account.signTypedData({
    domain: domain(),
    types: FORWARD_TYPES,
    primaryType: "ForwardRequest",
    message: { ...m, value: BigInt(m.value), gas: BigInt(m.gas), nonce: BigInt(m.nonce) },
  });
  return execute(m, signature);
}

/** Direct transaction from a server key (bank desk, governance, keeper). */
export async function sendFrom(key: Hex, c: Call): Promise<Hex> {
  const wallet = walletFor(key);
  const hash = await wallet.writeContract({
    address: c.to,
    abi: abi(c.abiName),
    functionName: c.functionName,
    args: c.args as unknown[],
  });
  const r = await publicClient().waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("TX_FAILED");
  return hash;
}
