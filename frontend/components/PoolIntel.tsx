"use client";

import { useState } from "react";
import { Badge } from "@/components/Badge";
import { BrandButton } from "@/components/BrandButton";
import { CURATED_POOLS, GRAPH_API_KEY, UNISWAP_V3_SUBGRAPH, type IntelRecord } from "./aegis";

type LivePrice = { eth: string; usdc: string; btc: string };

export function PoolIntel({
  intel: propIntel,
  onIntel: propOnIntel,
}: {
  intel?: IntelRecord | null;
  onIntel?: (i: IntelRecord | null) => void;
} = {}) {
  const [internalIntel, setInternalIntel] = useState<IntelRecord | null>(null);
  const [poolKey, setPoolKey] = useState(CURATED_POOLS[0].key);
  const [price, setPrice] = useState<LivePrice | null>(null);
  const [priceNote, setPriceNote] = useState("");
  const [graphNote, setGraphNote] = useState("");
  const [status, setStatus] = useState("");

  const isControlled = propIntel !== undefined;
  const intel = isControlled ? propIntel : internalIntel;

  const pool = CURATED_POOLS.find((p) => p.key === poolKey) ?? CURATED_POOLS[0];

  function handleSetIntel(next: IntelRecord | null) {
    if (propOnIntel) {
      propOnIntel(next);
    } else {
      setInternalIntel(next);
    }
  }

  async function fetchLivePrice() {
    setPriceNote("Fetching CoinGecko…");
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,usd-coin,bitcoin&vs_currencies=usd&precision=2"
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as Record<string, { usd?: number }>;
      setPrice({
        eth: String(j.ethereum?.usd ?? "?"),
        usdc: String(j["usd-coin"]?.usd ?? "?"),
        btc: String(j.bitcoin?.usd ?? "?"),
      });
      setPriceNote(`Live · ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      setPriceNote(
        `CoinGecko unreachable — showing saved values. (${
          err instanceof Error ? err.message : String(err)
        })`
      );
    }
  }

  async function querySubgraph() {
    if (!GRAPH_API_KEY) {
      setGraphNote(
        "No NEXT_PUBLIC_GRAPH_API_KEY — live subgraph query disabled. Run agent/ with Subgraph Studio key."
      );
      return;
    }
    setGraphNote("Querying live Uniswap V3 subgraph…");
    try {
      const res = await fetch(
        `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/${UNISWAP_V3_SUBGRAPH}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            query: `{ pool(id: "${pool.address.toLowerCase()}") { id totalValueLockedUSD volumeUSD feesUSD txCount } }`,
          }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as {
        data?: {
          pool?: {
            totalValueLockedUSD?: string;
            volumeUSD?: string;
            feesUSD?: string;
            txCount?: string;
          } | null;
        };
      };
      const p = j.data?.pool;
      setGraphNote(
        p
          ? `Live: TVL $${Number(p.totalValueLockedUSD).toLocaleString()} · vol $${Number(
              p.volumeUSD
            ).toLocaleString()} · fees $${Number(p.feesUSD).toLocaleString()} · txs ${p.txCount}`
          : "Live query returned no pool — check the pool address."
      );
    } catch (err) {
      setGraphNote(
        `Subgraph unreachable. (${err instanceof Error ? err.message : String(err)})`
      );
    }
  }

  return (
    <div className="border border-border bg-bg-elevated p-6 w-full" id="intel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-medium tracking-[-0.03em] text-ink">Pool intel</h2>
        <Badge tone="ok">live data</Badge>
      </div>
      <p className="mt-2 font-display text-[16px] italic leading-relaxed text-fg-body">
        The pools our agents reason over, with live market data from CoinGecko and The Graph.
      </p>

      {/* Tabs */}
      <div className="mt-5 flex border-b border-border overflow-x-auto">
        {CURATED_POOLS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`px-4 py-2.5 font-label text-xs uppercase tracking-[0.14em] border-b-2 transition-colors ${
              p.key === poolKey
                ? "border-accent text-ink font-medium bg-bg"
                : "border-transparent text-fg-muted hover:text-ink"
            }`}
            onClick={() => setPoolKey(p.key)}
          >
            {p.label} {p.fee}
          </button>
        ))}
      </div>

      <div className="mt-4 border border-border bg-bg p-5">
        <div className="flex items-center justify-between">
          <p className="font-display text-lg font-medium text-ink">
            {pool.label} · {pool.fee}
          </p>
          <Badge tone="ok">active</Badge>
        </div>
        <p className="mt-2 font-display text-sm text-fg-muted">
          TVL {pool.demoTvlUsd} · {pool.demoVolume}
        </p>
        {price && (
          <div className="mt-3 flex items-center gap-2 font-label text-xs text-ink">
            <span className="text-accent">●</span>
            ETH ${price.eth} · USDC ${price.usdc} · BTC ${price.btc}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <BrandButton variant="ghost" onClick={fetchLivePrice} className="h-9 px-3 text-xs">
            Refresh prices
          </BrandButton>
          <BrandButton variant="ghost" onClick={querySubgraph} className="h-9 px-3 text-xs">
            Refresh onchain data
          </BrandButton>
        </div>
        {priceNote && <p className="mt-2 font-label text-[11px] text-fg-muted">{priceNote}</p>}
        {graphNote && <p className="mt-2 font-label text-[11px] text-fg-muted">{graphNote}</p>}
      </div>

      {intel && (
        <div className="mt-4 border border-border bg-bg p-5">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs uppercase tracking-[0.14em] text-fg-muted">Risk score</span>
            <Badge tone={intel.riskScore < 50 ? "ok" : intel.riskScore < 75 ? "warn" : "bad"}>
              {intel.riskScore} / 100
            </Badge>
          </div>
          <p className="mt-2 font-display text-sm leading-relaxed text-fg-body">{intel.rationale}</p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <BrandButton
          onClick={() => {
            const score = Math.floor(Math.random() * 100);
            const decision = score < 50 ? "ACT" : "SKIP";
            handleSetIntel({
              riskScore: score,
              rationale: `${pool.label} ${pool.fee} — risk score ${score}/100. ${
                decision === "ACT"
                  ? "Liquidity depth and volume metrics are favorable."
                  : "Risk factors exceed acceptable threshold."
              } Pool: ${pool.address}`,
              raw: { pool: pool.address, tvl: pool.demoTvlUsd, volume: pool.demoVolume },
            });
            setStatus(`Sample intel generated for ${pool.label} ${pool.fee} (score: ${score}).`);
          }}
          className="h-11 px-5"
        >
          Generate sample intel
        </BrandButton>
        {intel && (
          <BrandButton
            variant="quiet"
            onClick={() => {
              handleSetIntel(null);
              setStatus("Intel cleared.");
            }}
            className="h-11 px-4"
          >
            Clear intel
          </BrandButton>
        )}
      </div>

      {status && <p className="mt-4 font-label text-xs text-fg-muted">{status}</p>}
    </div>
  );
}

export default PoolIntel;
