# AEGIS Frontend — Agent Dashboard

Next.js 14 App Router + TypeScript + plain CSS. Owns `frontend/` only — never touches
`contracts/`, `agent/`, `service/`.

## Run

```bash
npm install
npm run dev   # http://localhost:3000
```

Copy `.env.example` → `.env.local` and fill in:

- `NEXT_PUBLIC_SEPOLIA_RPC` — Sepolia RPC URL
- `NEXT_PUBLIC_AEGIS_REGISTRY` — deployed `AegisRegistry` address (leave zero-address until deployed)
- `NEXT_PUBLIC_SIGNAL_URL` — x402-gated signal service `POST /v1/signal` URL

Until `NEXT_PUBLIC_AEGIS_REGISTRY` is set, panels run in **"not deployed yet"** mode:
onchain writes/reads are disabled and records are kept in `localStorage` as pending.

## How the demo records each panel

1. **Onboard** — fill sublabel + agent wallet + expiry days → *Mint agent subname*.
   With a registry: MetaMask (Sepolia) `mintAgent(sublabel, wallet, expiry)`; without: saved locally as pending.
2. **Agents** — lists `localStorage` records (`sublabel.aegis.eth`, wallet, expiry, revoked).
   *Refresh from registry* re-reads `agentOf(sublabel)`; *Revoke* calls `revokeAgent(sublabel)`.
3. **Intel** — *Load sample*, then *Display intel*: parses pasted The Graph intel JSON
   (`{ riskScore, rationale, … }`) and renders score badge + rationale + raw JSON. Persisted to `localStorage`.
4. **Payments** — *Ping signal service* shows live `402` state; after the `agent/` x402 flow,
   paste the Hedera tx id + amount → *Add receipt*. Each receipt links to HashScan testnet.

## Typecheck

```bash
npx tsc --noEmit
```
