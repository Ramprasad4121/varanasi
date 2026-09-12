"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/Badge";
import { BrandButton } from "@/components/BrandButton";
import { LS_RECEIPTS, SIGNAL_URL, hashscanTx, type Receipt } from "./aegis";
import { useVaultUserId, loadScoped, saveScoped } from "@/lib/vault";

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

export function SignalPanel({
  receipts: propReceipts,
  onReceipts: propOnReceipts,
}: {
  receipts?: Receipt[];
  onReceipts?: (r: Receipt[]) => void;
} = {}) {
  const userId = useVaultUserId();
  const [internalReceipts, setInternalReceipts] = useState<Receipt[]>([]);
  const [feed, setFeed] = useState<Receipt[]>([]);
  const [status, setStatus] = useState("");
  const loadedRef = useRef(false);

  const isControlled = propReceipts !== undefined;
  const receipts = isControlled ? propReceipts : internalReceipts;

  useEffect(() => {
    if (!isControlled) {
      setInternalReceipts(loadScoped<Receipt[]>(userId, LS_RECEIPTS, []));
    }
  }, [isControlled, userId]);

  function handleSetReceipts(next: Receipt[]) {
    if (propOnReceipts) {
      propOnReceipts(next);
    } else {
      setInternalReceipts(next);
      saveScoped(userId, LS_RECEIPTS, next);
    }
  }

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
        if (cancelled) return;
        setFeed(normalized.slice(0, 24));
        setStatus(
          normalized.length > 0
            ? `Public service feed: ${normalized.length} receipt(s). Settled purchases in this vault stay scoped to your account.`
            : "Service reachable — no receipts yet."
        );
      } catch {
        // Service unreachable — props/localStorage cache stands as fallback.
      }
    }
    loadPersisted();
    return () => {
      cancelled = true;
    };
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
      if (res.status === 402) {
        setStatus(
          "Payment required ($0.01 x402) — run the agent loop (agent/ CLI) to pay and settle, then Refresh receipts."
        );
      } else if (res.status === 200) {
        // A 200 means *you* settled this one — keep its receipt in your own
        // vault. (The public feed stays view-only; never merged in.)
        try {
          const body = (await res.json()) as {
            receipt?: { txId?: string; amount?: string; servedAt?: string };
          };
          const rc = body.receipt;
          if (rc?.txId) {
            handleSetReceipts([
              {
                txId: String(rc.txId),
                endpoint: url,
                amount: String(rc.amount ?? "$0.01"),
                at: String(rc.servedAt ?? new Date().toISOString()),
              },
              ...receipts,
            ]);
          }
        } catch {
          /* body shape drifted — nothing to record; the panel still reports status */
        }
        setStatus("Signal paid and settled on Hedera via x402. See receipts below.");
      } else {
        setStatus(`Signal request returned HTTP ${res.status} — is the service running?`);
      }
    } catch (err) {
      setStatus(`Signal service unreachable at ${url}. ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function fetchReceipts() {
    const url = receiptsEndpoint();
    setStatus("Refreshing receipts…");
    try {
      const res = await fetch(url);
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
      setFeed(normalized.slice(0, 24));
      setStatus(
        normalized.length > 0
          ? `Public service feed: ${normalized.length} receipt(s).`
          : "Service reachable — no receipts yet."
      );
    } catch (err) {
      setStatus(`Receipts endpoint unreachable. ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="border border-border bg-bg-elevated p-6 w-full" id="signals">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-medium tracking-[-0.03em] text-ink">Paid signals</h2>
        <Badge tone="ok">x402 rail</Badge>
      </div>
      <p className="mt-2 font-display text-[16px] italic leading-relaxed text-fg-body">
        Agents buy premium market alpha — paid and settled on Hedera via x402.
      </p>

      <dl className="mt-5 grid grid-cols-3 gap-px border border-border bg-border">
        <div className="bg-bg p-4 text-center">
          <dt className="font-display text-3xl font-medium text-ink">{receipts.length}</dt>
          <dd className="mt-1 font-label text-[10px] uppercase tracking-[0.14em] text-fg-muted">receipts</dd>
        </div>
        <div className="bg-bg p-4 text-center">
          <dt className="font-display text-3xl font-medium text-ink">$0.01</dt>
          <dd className="mt-1 font-label text-[10px] uppercase tracking-[0.14em] text-fg-muted">per signal</dd>
        </div>
        <div className="bg-bg p-4 text-center">
          <dt className="font-display text-3xl font-medium text-ink">x402</dt>
          <dd className="mt-1 font-label text-[10px] uppercase tracking-[0.14em] text-fg-muted">gate</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        <BrandButton onClick={requestSignal} className="h-11 px-5">
          Request a signal
        </BrandButton>
        <BrandButton variant="ghost" onClick={fetchReceipts} className="h-11 px-5">
          Refresh receipts
        </BrandButton>
      </div>

      {receipts.length > 0 && (
        <ul className="mt-6 divide-y divide-border border border-border overflow-hidden">
          {receipts.map((r) => (
            <li key={`${r.txId}-${r.at}`} className="p-4 bg-bg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="font-label text-xs text-ink">{r.txId}</p>
                <p className="font-display text-sm text-fg-muted">
                  {r.amount} · {new Date(r.at).toLocaleString()}
                </p>
              </div>
              <a
                href={hashscanTx(r.txId)}
                target="_blank"
                rel="noreferrer"
                className="font-label text-[11px] uppercase tracking-[0.12em] text-accent underline underline-offset-4"
              >
                HashScan ↗
              </a>
            </li>
          ))}
        </ul>
      )}

      {feed.filter((r) => !receipts.some((m) => m.txId === r.txId)).length > 0 && (
        <div className="mt-6">
          <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">
            Public service feed — anyone's settled requests, not yours alone
          </p>
          <ul className="mt-2 divide-y divide-border border border-border overflow-hidden opacity-70">
            {feed
              .filter((r) => !receipts.some((m) => m.txId === r.txId))
              .slice(0, 6)
              .map((r) => (
                <li key={`feed-${r.txId}-${r.at}`} className="p-3 bg-bg flex items-center justify-between gap-2">
                  <p className="font-label text-[11px] text-fg-muted">
                    {r.txId} · {r.amount}
                  </p>
                  <a
                    href={hashscanTx(r.txId)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-label text-[10px] uppercase tracking-[0.12em] text-fg-muted underline underline-offset-4"
                  >
                    ↗
                  </a>
                </li>
              ))}
          </ul>
        </div>
      )}

      {status && <p className="mt-4 font-label text-xs text-fg-muted">{status}</p>}
    </div>
  );
}

export default SignalPanel;
