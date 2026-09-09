"use client";

// Author: Ramprasad — SignalPanel paid x402 flow: request a signal, list receipts with HashScan links; live dep signal service (SIGNAL_URL); degrades gracefully when service down.
import { useEffect, useRef, useState } from "react";
import { LS_RECEIPTS, SIGNAL_URL, hashscanTx, load, type Receipt } from "./aegis";

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
// Paid signals: request a signal (x402-gated) + persisted receipts.
// ---------------------------------------------------------------------------
export default function SignalPanel({
  receipts,
  onReceipts,
}: {
  receipts: Receipt[];
  onReceipts: (r: Receipt[]) => void;
}) {
  const [status, setStatus] = useState("");
  const loadedRef = useRef(false);

  // On load: GET persisted receipts from the service; localStorage as fallback.
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
            txId: String(r.txId ?? r.tx_id ?? r.txHash ?? r.id ?? ""),
            endpoint: String(r.endpoint ?? signalEndpoint()),
            amount: String(r.amount ?? "(unknown)"),
            at: String(r.at ?? r.timestamp ?? new Date().toISOString()),
          }))
          .filter((r) => r.txId.length >= 3);
        if (cancelled || normalized.length === 0) return;
        const seen = new Set(normalized.map((r) => r.txId));
        const cached = load<Receipt[]>(LS_RECEIPTS, []);
        onReceipts([...normalized, ...cached.filter((r) => !seen.has(r.txId))]);
        setStatus(`${normalized.length} receipt(s) loaded.`);
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
    setStatus("Requesting a signal…");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "usdc-weth momentum" }),
      });
      if (res.status === 402 || res.status === 200) {
        setStatus(
          "Signal ready — payment settles on Hedera via x402. See receipts below."
        );
      } else {
        setStatus(
          `Signal request returned HTTP ${res.status} — is the service running?`
        );
      }
    } catch (err) {
      setStatus(
        `Signal service unreachable at ${url}. ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  async function fetchReceipts() {
    const url = receiptsEndpoint();
    setStatus("Refreshing receipts…");
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as unknown;
      const count = Array.isArray(data)
        ? data.length
        : Array.isArray((data as { receipts?: unknown }).receipts)
          ? (data as { receipts: unknown[] }).receipts.length
          : 0;
      setStatus(`${count} receipt(s) on the service.`);
    } catch (err) {
      setStatus(
        `Receipts endpoint unreachable. ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return (
    <section className="panel" id="signals">
      <h2>Paid signals</h2>
      <p className="desc">
        Agents buy premium market alpha — paid and settled on Hedera via x402.
      </p>

      <dl className="statsband" style={{ margin: "16px 0 0", gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="stat-item">
          <dt className="stat-num">{receipts.length}</dt>
          <dd className="stat-label">receipts</dd>
        </div>
        <div className="stat-item">
          <dt className="stat-num">$0.01</dt>
          <dd className="stat-label">per signal</dd>
        </div>
        <div className="stat-item">
          <dt className="stat-num">x402</dt>
          <dd className="stat-label">gate</dd>
        </div>
      </dl>

      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={requestSignal}>Request a signal</button>
        <button onClick={fetchReceipts}>Refresh receipts</button>
      </div>

      {receipts.map((r) => (
        <div className="card" key={`${r.txId}-${r.at}`}>
          <div>
            <code>{r.txId}</code>{" "}
            <a href={hashscanTx(r.txId)} target="_blank" rel="noreferrer">
              HashScan ↗
            </a>
          </div>
          <div className="muted">
            {r.amount} · {new Date(r.at).toLocaleString()}
          </div>
        </div>
      ))}
      <div className="status">{status}</div>
    </section>
  );
}
