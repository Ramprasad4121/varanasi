"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  DEMO_RECEIPTS,
  LS_RECEIPTS,
  SIGNAL_URL,
  hashscanTx,
  load,
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
  const [step, setStep] = useState(0); // completed steps of 4
  const [requirements, setRequirements] = useState("");
  const [txId, setTxId] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  const loadedRef = useRef(false);

  // On load: GET persisted receipts from the service; localStorage stays as
  // the cache fallback when the service is unreachable. Receipt shape is
  // unchanged ({ txId, endpoint, amount, at }).
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;
    async function loadPersisted() {
      try {
        const res = await fetch(receiptsEndpoint());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as unknown;
        const list = Array.isArray(data)
          ? data
          : Array.isArray((data as { receipts?: unknown }).receipts)
            ? (data as { receipts: unknown[] }).receipts
            : [];
        const normalized: Receipt[] = (list as Record<string, unknown>[])
          .map((r) => ({
            txId: String(
              r.txId ?? r.tx_id ?? r.txHash ?? r.id ?? ""
            ),
            endpoint: String(r.endpoint ?? signalEndpoint()),
            amount: String(r.amount ?? "(unknown)"),
            at: String(
              r.at ?? r.timestamp ?? new Date().toISOString()
            ),
          }))
          .filter((r) => r.txId.length >= 3);
        if (cancelled || normalized.length === 0) return;
        const seen = new Set(normalized.map((r) => r.txId));
        const cached = load<Receipt[]>(LS_RECEIPTS, []);
        onReceipts([
          ...normalized,
          ...cached.filter((r) => !seen.has(r.txId)),
        ]);
        setStep(4);
        setStatus(
          `Loaded ${normalized.length} persisted receipt(s) from the service.`
        );
      } catch {
        // Service unreachable — props/localStorage cache stands as fallback.
      }
    }
    loadPersisted();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestSignal() {
    const url = signalEndpoint();
    setStep(1);
    setStatus(`POST ${url} (no payment)…`);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "usdc-weth momentum" }),
      });
      if (res.status === 402) {
        const body = await res.text();
        setRequirements(body.slice(0, 1200));
        setStep(2);
        setStatus(
          "HTTP 402 Payment Required — service wants ~$0.01 USDC or 0.01 HBAR (hedera:testnet, Blocky402). " +
            "Browser can't sign Hedera transfers — pay via agent/payer, then paste the receipt below."
        );
      } else {
        setStatus(`HTTP ${res.status} — no 402 (service may be open or changed).`);
        setRequirements(await res.text().then((t) => t.slice(0, 1200)));
      }
    } catch (err) {
      setStatus(
        `Service unreachable at ${url} — is it running on :4021? (${
          err instanceof Error ? err.message : String(err)
        })`
      );
    }
  }

  async function fetchReceipts() {
    const url = receiptsEndpoint();
    setStatus(`GET ${url}…`);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as unknown;
      const count = Array.isArray(data)
        ? data.length
        : Array.isArray((data as { receipts?: unknown }).receipts)
          ? (data as { receipts: unknown[] }).receipts.length
          : 0;
      setStatus(`Service receipts: ${count} persisted (see list below).`);
      if (count > 0) setStep(4);
    } catch (err) {
      setStatus(
        `Receipts endpoint unreachable (file-backed on the service; HashScan links are the durable proof). (${
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
    setStep(4);
    setStatus("Receipt recorded — paid flow complete. Links verify on HashScan.");
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

      <ol className="stepper" aria-label="x402 payment flow">
        {["Request", "402", "Pay", "Receipt"].map((label, i) => {
          const done = step > i;
          const current = step === i;
          return (
            <li
              key={label}
              className={done ? "done" : current ? "active" : "todo"}
              aria-current={current ? "step" : undefined}
            >
              {i + 1} · {label}
              {done ? " ✓" : ""}
            </li>
          );
        })}
      </ol>
      <p className="muted">
        Slow network? The 402 round-trip can take up to ~30s — keep this panel
        open. Receipts persist on the service and in localStorage, so a reload
        never loses a paid receipt.
      </p>
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
          onChange={(e) => {
            setTxId(e.target.value);
            if (e.target.value.trim()) setStep((s) => Math.max(s, 3));
          }}
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
