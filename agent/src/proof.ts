/**
 * @author Ramprasad — unified proof envelope every worker must return.
 */
export type ProofEnvelope = {
  ok: true;
  agent: string;
  ens: string;
  mandateId: string;
  input: Record<string, string>;
  output: Record<string, unknown>;
  bar: string;
  barPassed: boolean;
  evidence: { txs: string[]; hash: string; block: number | null; chain: "sepolia" };
  settled: "released" | "refunded" | "pending";
  at: string;
};

export type ProofFail = { ok: false; agent: string; error: string };
export type ProofResult = ProofEnvelope | ProofFail;

/** FNV-1a 32-bit padded to 32 bytes. Labeled in evidence — not keccak. */
export function proofHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `0x${(h >>> 0).toString(16).padStart(8, "0")}${"0".repeat(56)}`.slice(0, 66);
}

/** @deprecated alias */
export const keccakLite = proofHash;

export function makeProof(args: {
  agent: string;
  ens: string;
  mandateId?: string;
  input: Record<string, string>;
  output: Record<string, unknown>;
  bar: string;
  barPassed: boolean;
  txs?: string[];
}): ProofEnvelope {
  const at = new Date().toISOString();
  const hash = proofHash(JSON.stringify({ agent: args.agent, input: args.input, output: args.output, at }));
  return {
    ok: true,
    agent: args.agent,
    ens: args.ens,
    mandateId: args.mandateId ?? hash,
    input: args.input,
    output: args.output,
    bar: args.bar,
    barPassed: args.barPassed,
    evidence: { txs: args.txs ?? [], hash, block: null, chain: "sepolia" },
    settled: args.barPassed ? "pending" : "refunded",
    at,
  };
}
