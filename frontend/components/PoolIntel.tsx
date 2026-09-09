"use client";

// Author: Ramprasad — PoolIntel panel: curated Uniswap pools + CoinGecko live prices + The Graph subgraph query; live deps CoinGecko public API, gateway.thegraph.com (NEXT_PUBLIC_GRAPH_API_KEY), CURATED_POOLS.
import { useState } from "react";
import { CURATED_POOLS, GRAPH_API_KEY, UNISWAP_V3_SUBGRAPH, type IntelRecord } from "./aegis";

type LivePrice = { eth: string; usdc: string; btc: string };

// ---------------------------------------------------------------------------
// Pool intel: curated pool selector + quote card
// (live ETH price via public CoinGecko; live subgraph query when the Graph key
//  is set; graceful note otherwise)
// ---------------------------------------------------------------------------
export default function PoolIntel({
  intel,
  onIntel,
}: {
  intel: IntelRecord | null;
  onIntel: (i: IntelRecord | null) => void;
}) {
  const [poolKey, setPoolKey] = useState(CURATED_POOLS[0].key);
  const [price, setPrice] = useState<LivePrice | null>(null);
  const [priceNote, setPriceNote] = useState("");
  const [graphNote, setGraphNote] = useState("");
  const [status, setStatus] = useState("");

  const pool = CURATED_POOLS.find((p) => p.key === poolKey) ?? CURATED_POOLS[0];

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
        "No NEXT_PUBLIC_GRAPH_API_KEY — live subgraph query disabled. " +
          "Demo-known values below (recorded 2026-09-06); run agent/ with a " +
          "Subgraph Studio key for the live path."
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
        `Subgraph unreachable — showing saved values. (${
          err instanceof Error ? err.message : String(err)
        })`
      );
    }
  }

  return (
    <section className="panel" id="intel">
      <h2>Pool intel</h2>
      <p className="desc">
        The pools our agents reason over, with live market data.
      </p>

      <label>Curated pool</label>
      <div className="pool-tabs" role="tablist">
        {CURATED_POOLS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={p.key === poolKey}
            className={p.key === poolKey ? "tab active" : "tab"}
            onClick={() => setPoolKey(p.key)}
          >
            {p.label} {p.fee}
          </button>
        ))}
      </div>

      <div className="card quote">
        <div>
          <strong>
            {pool.label} · {pool.fee}
          </strong>{" "}
          <span className="badge ok">live</span>
        </div>
        <div className="muted">
          TVL {pool.demoTvlUsd} · {pool.demoVolume}
        </div>
        {price && (
          <div>
            <span className="badge ok">live</span> ETH ${price.eth} · USDC $
            {price.usdc} · BTC ${price.btc}
          </div>
        )}
        <div className="row">
          <button onClick={fetchLivePrice}>Refresh prices</button>
          <button onClick={querySubgraph}>Refresh onchain data</button>
        </div>
        {priceNote && <div className="status">{priceNote}</div>}
        {graphNote && <div className="status">{graphNote}</div>}
      </div>

      {intel && (
        <div className="card" style={{ marginTop: 12 }}>
          <div>
            risk score{" "}
            <span
              className={`badge ${
                intel.riskScore < 50
                  ? "ok"
                  : intel.riskScore < 75
                    ? "warn"
                    : "bad"
              }`}
            >
              {intel.riskScore}
            </span>
          </div>
          <div style={{ marginTop: 6 }}>{intel.rationale}</div>
        </div>
      )}
      <div className="status">{status}</div>
    </section>
  );
}
