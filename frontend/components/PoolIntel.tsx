"use client";

// Author: Ramprasad — PoolIntel panel: curated Uniswap pools + CoinGecko live prices + The Graph subgraph query + intel JSON parse; live deps CoinGecko public API, gateway.thegraph.com (NEXT_PUBLIC_GRAPH_API_KEY), CURATED_POOLS; degrades to demo-known stats + unreachable notes when keys/APIs missing.
import { useState } from "react";
import {
  CURATED_POOLS,
  GRAPH_API_KEY,
  UNISWAP_V3_SUBGRAPH,
  etherscanAddress,
  graphSubgraphUrl,
  type IntelRecord,
} from "./aegis";

const SAMPLE_INTEL = JSON.stringify(
  {
    pool: "USDC/ETH 0.05% (Uniswap V3)",
    tvlUsd: 48_200_000,
    volume24hUsd: 9_600_000,
    apyEstimatePct: 12.4,
    riskScore: 38,
    rationale:
      "Deep TVL + steady volume; fee tier matches pair volatility. Score < 50 → enter with capped size.",
  },
  null,
  2
);

type LivePrice = { eth: string; usdc: string; btc: string };

// ---------------------------------------------------------------------------
// Pool intel: curated pool selector + honest quote card
// (demo-known pool stats labelled; live ETH price via public CoinGecko;
//  live subgraph query only when NEXT_PUBLIC_GRAPH_API_KEY is set)
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
  const [text, setText] = useState("");
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
        `CoinGecko unreachable — quote card keeps demo-known values. (${
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
        `Subgraph unreachable — demo-known values stand. (${
          err instanceof Error ? err.message : String(err)
        })`
      );
    }
  }

  function parse() {
    try {
      const raw = JSON.parse(text || "{}") as Record<string, unknown>;
      const riskScore = Number(raw.riskScore ?? raw.risk_score ?? NaN);
      const rationale = String(raw.rationale ?? raw.reason ?? "");
      if (!Number.isFinite(riskScore) || !rationale) {
        setStatus(
          "Intel JSON needs at least { riskScore: number, rationale: string }."
        );
        return;
      }
      onIntel({ riskScore, rationale, raw });
      setStatus(`Recorded intel — risk score ${riskScore}.`);
    } catch (err) {
      setStatus(
        `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return (
    <section className="panel" id="intel">
      <h2>Pool intel</h2>
      <p className="desc">
        Curated Uniswap pools the agents reason over. Stats marked{" "}
        <span className="badge warn">demo-known</span> were recorded 2026-09-06
        (docs/DEMO.md); anything marked <span className="badge ok">live</span>{" "}
        was just fetched.
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
          <span className="badge warn">demo-known stats</span>
        </div>
        <div>
          pool{" "}
          <a
            href={etherscanAddress(pool.address)}
            target="_blank"
            rel="noreferrer"
          >
            <code>{pool.address}</code> ↗
          </a>
        </div>
        <div className="muted">
          TVL {pool.demoTvlUsd} · {pool.demoVolume}
          {pool.key === "usdc-weth-005" && " (Uniswap V3 official subgraph)"}
        </div>
        <div>
          subgraph{" "}
          <a
            href={graphSubgraphUrl(UNISWAP_V3_SUBGRAPH)}
            target="_blank"
            rel="noreferrer"
          >
            <code>{UNISWAP_V3_SUBGRAPH.slice(0, 12)}…</code> ↗
          </a>
        </div>
        {price && (
          <div>
            <span className="badge ok">live</span> ETH ${price.eth} · USDC $
            {price.usdc} · BTC ${price.btc}{" "}
            <span className="muted">(CoinGecko public API)</span>
          </div>
        )}
        <div className="row">
          <button onClick={fetchLivePrice}>Fetch live prices</button>
          <button onClick={querySubgraph}>Query live subgraph</button>
        </div>
        {priceNote && <div className="status">{priceNote}</div>}
        {graphNote && <div className="status">{graphNote}</div>}
      </div>

      <label style={{ marginTop: 12 }}>
        Agent intel JSON (paste from <code>agent/</code> Subgraph MCP →
        reasoning)
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='{"riskScore": 38, "rationale": "…", …}'
      />
      <div className="row">
        <button onClick={parse}>Display intel</button>
        <button onClick={() => setText(SAMPLE_INTEL)}>Load sample</button>
        <button
          onClick={() => {
            onIntel(null);
            setStatus("Cleared.");
          }}
        >
          Clear
        </button>
      </div>
      {intel && (
        <div className="card">
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
          <pre style={{ marginTop: 8 }}>
            {JSON.stringify(intel.raw, null, 2)}
          </pre>
        </div>
      )}
      <div className="status">{status}</div>
    </section>
  );
}
