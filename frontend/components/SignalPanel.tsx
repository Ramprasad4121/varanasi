"use client";

import { useState, type FormEvent } from "react";
import {
  DEMO_RECEIPTS,
  SIGNAL_URL,
  hashscanTx,
  type Receipt,
} from "./aegis";

function signalEndpoint() {
  const base = SIGNAL_URL.replace(/\/$/, "");
  return base.endsWith("/v1/signal") ? base : `${base}/v1/signal`;
}

function receiptsEndpoint() {
  const base = SIGNAL_URL.replace(/\/$/, "");
  return base.endsWith("/v1/receipts")
    ? base
    : `${base.replace(/\/v1\/signal$/, "")}/v1/receipts`;
}

// ---------------------------------------------------------------------------
// Paid signals: 402-then-paid x402 flow status + receipts with HashScan links
// (keeps existing ping + manual receipt functionality)
// ---------------------------------------------------------------------------
export default function SignalPanel({
  receipts,
  onReceipts,
}: {
  receipts: Receipt[];
  onReceipts: (r: Receipt[]) => void;
}) {
  const [flow, setFlow] = useState<string[]>([
    "idle — press “Request paid signal” to start the 402 flow.",
  ]);
  const [requirements, setRequirements] = useState("");
  const [txId, setTxId] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");

  function push(line: string) {
    setFlow((prev) => [...prev.slice(-5), line]);
  }

  async function requestSignal() {
    const url = signalEndpoint();
    push(`1 · POST ${url} (no payment)…`);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "usdc-weth momentum" }),
      });
      if (res.status === 402) {
        const body = await res.text();
        setRequirements(body.slice(0, 1200));
        push(
          "2 · HTTP 402 Payment Required — service wants ~$0.01 USDC or 0.01 HBAR (hedera:testnet, Blocky402)."
        );
        push(
          "3 · Browser can't sign Hedera transfers — pay via agent/ payer, then paste the receipt below."
        );
      } else {
        push(`2 · HTTP ${res.status} — no 402 (service may be open or changed).`);
        setRequirements(await res.text().then((t) => t.slice(0, 1200)));
      }
    } catch (err) {
      push(
        `2 · Service unreachable at ${url} — is it running on :4021? (${
          err instanceof Error ? err.message : String(err)
        })`
      );
    }
  }

  async function fetchReceipts() {
    const url = receiptsEndpoint();
    push(`GET ${url}…`);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      push(`Service receipts: ${(await res.text()).slice(0, 500)}`);
    } catch (err) {
      push(
        `Receipts endpoint unreachable (in-memory on the service; HashScan links are the durable proof). (${
          err instanceof Error ? err.message : String(err)
        })`
      );
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const id = txId.trim().replace(/^0x/, "");
    if (!/^[\da-fA-F.\-@]{3,128}$/.test(id)) {
      setStatus("Paste a Hedera tx id like 0.0.7162784-1788675749-710110370.");
      return;
    }
    onReceipts([
      {
        txId: id.startsWith("0.0.") ? id : txId.trim(),
        endpoint: signalEndpoint(),
        amount: amount.trim() || "(unknown)",
        at: new Date().toISOString(),
      },
      ...receipts,
    ]);
    push("4 · Receipt recorded — paid flow complete. Links verify on HashScan.");
    setStatus("Receipt recorded.");
    setTxId("");
  }

  return (
    <section className="panel">
      <h2>Paid signals</h2>
      <p className="desc">
        Agents buy premium alpha through the Hedera x402 gate:{" "}
        <code>POST → 402 → pay → retry → receipt</code>. Demo-known paid txs are
        pinned below with HashScan proof.
      </p>

      <ol className="flow">
        {flow.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      <div className="row">
        <button onClick={requestSignal}>Request paid signal</button>
        <button onClick={fetchReceipts}>List service receipts</button>
      </div>
      {requirements && <pre style={{ marginTop: 8 }}>{requirements}</pre>}

      <div className="card">
        <div>
          <strong>Demo-known paid txs</strong>{" "}
          <span className="badge warn">demo-known</span>
        </div>
        {DEMO_RECEIPTS.map((id) => (
          <div key={id}>
            <code>{id}</code>{" "}
            <a href={hashscanTx(id)} target="_blank" rel="noreferrer">
              HashScan ↗
            </a>
          </div>
        ))}
        <div className="muted">
          −10000 microUSDC (0.0.429274) agent 0.0.10383444 → service 0.0.10384527
        </div>
      </div>

      <form onSubmit={add}>
        <label>Hedera tx id (your paid receipt)</label>
        <input
          value={txId}
          onChange={(e) => setTxId(e.target.value)}
          placeholder="0.0.7162784-1788675749-710110370"
        />
        <label>Amount (e.g. $0.01 USDC)</label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="$0.01 USDC"
        />
        <button type="submit">Add receipt</button>
      </form>
      {receipts.map((r) => (
        <div className="card" key={`${r.txId}-${r.at}`}>
          <div>
            <code>{r.txId}</code>
          </div>
          <div>
            {r.amount} · {r.endpoint} · {new Date(r.at).toLocaleString()}
          </div>
          <div>
            <a href={hashscanTx(r.txId)} target="_blank" rel="noreferrer">
              View on HashScan ↗
            </a>
          </div>
        </div>
      ))}
      <div className="status">{status}</div>
    </section>
  );
}
