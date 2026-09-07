# varanasi Frontend — Agent Marketplace

Author: Ramprasad

Next.js 14 App Router + TypeScript + plain CSS. Owns `frontend/` only — never touches
`contracts/`, `agent/`, `service/`.

Marketplace view (`app/page.tsx` + `components/` + `app/marketplace.css`):

- **Hero** — one-line pitch + live stats (registry address → Sepolia Etherscan,
  authorized count, RiskGuard, signal URL).
- **Agents for hire** — featured demo-known `sentinel-1.aegis.eth` (mint tx link +
  *Verify live onchain* via `agentOf`), list-a-new-agent form (`mintAgent` or local
  pending), agent cards (wallet, expiry, authorized/revoked/expired badge,
  *Refresh onchain*, *Revoke*).
- **Pool intel** — curated pool selector (USDC/WETH 0.05% `0x88e6…`, USDC/WETH 0.3%,
  WBTC/WETH 0.3%), honest quote card (pool stats labelled `demo-known` from
  `docs/DEMO.md`, Etherscan + subgraph links), *Fetch live prices* (CoinGecko public
  API), *Query live subgraph* (needs `NEXT_PUBLIC_GRAPH_API_KEY`), plus the intel
  JSON paste/parse panel (`{ riskScore, rationale }`).
- **Paid signals** — numbered 402-then-paid flow log (`POST → 402 → pay → receipt`),
  live `POST /v1/signal` attempt showing payment requirements, demo-known paid txs
  with HashScan links, manual receipt add (each links to HashScan testnet).
- **Verdict timeline** — seeded demo-known verdict (`riskScoreBps: 200, ACT`),
  *Log verdict from current intel*, clear. Local/mock-able, newest first.

Honesty rule: onchain/RPC/service failures never crash — panels keep demo-known
values and show addresses + "connect" hints.

## Run

```bash
npm install
npm run dev   # http://localhost:3000
```

Copy `.env.example` → `.env.local` and fill in:

- `NEXT_PUBLIC_SEPOLIA_RPC` — Sepolia RPC URL
- `NEXT_PUBLIC_AEGIS_REGISTRY` — deployed `AegisRegistry` address
  (defaults to demo-known `0x0aed80646680eb333e0d2129f6f0fa54503b5381`)
- `NEXT_PUBLIC_SIGNAL_URL` — x402-gated signal service base URL
  (defaults to `http://localhost:4021`; `/v1/signal` appended if missing)
- `NEXT_PUBLIC_GRAPH_API_KEY` — optional, enables the live subgraph query button

Until `NEXT_PUBLIC_AEGIS_REGISTRY` is a non-zero address, onchain writes/reads run in
**"not deployed yet"** mode: records are kept in `localStorage` as pending.

## 60-second video click path

1. Hero: read pitch, click registry → Sepolia Etherscan (0–10s).
2. Agents: *Verify live onchain* on sentinel-1 → authorized; list a new agent
   (pending locally or mint via MetaMask) (10–25s).
3. Pool intel: switch pool tabs → Etherscan link; *Fetch live prices* → live badge;
   *Load sample* → *Display intel* (25–40s).
4. Paid signals: *Request paid signal* → 402 + requirements shown; open demo-known
   HashScan tx (40–50s).
5. Verdict timeline: *Log verdict from current intel* → new ACT card on top (50–60s).

## Typecheck / build

```bash
npx tsc --noEmit
npx next build
```
