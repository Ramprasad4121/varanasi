// Author: Ramprasad — /proof route: every claim links to Sepolia/HashScan.
// Static page (no client JS). All hashes verified against docs/DEMO.md.
import {
  AEGIS_HOOK,
  REGISTRY,
  RISK_GUARD,
  TASK_ESCROW,
  hashscanTx,
  sepoliaAddress,
  sepoliaTx,
} from "../../components/aegis";

const RECEIPTS: { title: string; hash: string; hedera?: boolean }[] = [
  { title: "Mandate funded", hash: "0x1a3765459f57f7b7af607623a5bface64680d771032695f6c9fa34915886f572" },
  { title: "Validation submitted", hash: "0xfde951571e35eaa1d0206b139322d539697846c00c3e8d508b01b76b13b2c061" },
  { title: "Escrow released", hash: "0x94b44e473c0746ed365e8714000ef41a7f21bbc4276c9aca29b9d134651eb702" },
  { title: "x402 payment", hash: "0.0.7162784-1788675749-710110370", hedera: true },
  { title: "Identity minted", hash: "0xa31520a82a8ea27c67f3b889d56eeab92944ae19e66645bee2958d3604134b41" },
  { title: "Kill-switch revoke", hash: "0xa7085e187947d8c35e4f83763a6668bb27a523db865f02b5cb24e172352c2043" },
];

const CONTRACTS: { name: string; address: string; note: string }[] = [
  { name: "TaskEscrow", address: TASK_ESCROW, note: "Mandate → fund → validate → release" },
  { name: "AegisRegistry", address: REGISTRY, note: "Revocable agent identity" },
  { name: "RiskGuard", address: RISK_GUARD, note: "Live authorize at settlement" },
  { name: "AegisHook", address: AEGIS_HOOK, note: "Uniswap v4 beforeSwap gate" },
];

function short(h: string) {
  return h.startsWith("0x") && h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
}

export default function ProofPage() {
  return (
    <section className="panel">
      <h2>Proof, not screenshots</h2>
      <p className="desc">
        Every claim here links to Sepolia or HashScan. Contracts are
        Sourcify-verified. There is no owner sweep.
      </p>

      <h3>Live receipts</h3>
      {RECEIPTS.map((r) => (
        <div className="card" key={r.hash}>
          <div>
            <strong>{r.title}</strong>{" "}
            <code>{short(r.hash)}</code>
          </div>
          <div>
            <a
              href={r.hedera ? hashscanTx(r.hash) : sepoliaTx(r.hash)}
              target="_blank"
              rel="noreferrer"
            >
              {r.hedera ? "Open HashScan ↗" : "Open Etherscan ↗"}
            </a>
          </div>
        </div>
      ))}

      <h3>Contracts · Sepolia</h3>
      {CONTRACTS.map((c) => (
        <div className="card" key={c.address}>
          <div>
            <strong>{c.name}</strong>
          </div>
          <div className="muted">{c.note}</div>
          <div>
            <a href={sepoliaAddress(c.address)} target="_blank" rel="noreferrer">
              <code>{c.address}</code> ↗
            </a>
          </div>
        </div>
      ))}

      <div className="row" style={{ marginTop: 12 }}>
        <a
          href="https://github.com/Ramprasad4121/varanasi/blob/main/docs/DEMO.md"
          target="_blank"
          rel="noreferrer"
        >
          Full demo log ↗
        </a>
        <a href="/#hire-wizard">Run a mandate →</a>
      </div>
      <p className="envline">
        <a href="/">← Back to the varanasi dashboard</a>
      </p>
    </section>
  );
}
