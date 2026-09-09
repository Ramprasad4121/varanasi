# varanasi Frontend — Agent Marketplace

Author: Ramprasad

Next.js 14 App Router + TypeScript + plain CSS. Owns `frontend/` only — never
touches `contracts/`, `agent/`, `service/`.

## Identity

Site-wide **Privy** (email, Google, GitHub, or a wallet) lives in the layout.
An embedded self-custodial Sepolia wallet is created on first login for users
without one. The product never stores private keys.

- **Sign in** in the nav — no flash while the session resolves
- `/account` — vault: identity, embedded wallet, hires, listed agents
- `/privy` — treasury dashboard (mint / fund / revoke)

Per-user data is keyed by the Privy user id. Guest `localStorage` migrates into
the vault on first sign-in. Set `NEXT_PUBLIC_PRIVY_APP_ID` (see
[`PRIVY.md`](PRIVY.md)); without it, the rest of the site still runs.

## Marketplace

- **Hero** — one-line pitch + live stats
- **Agents for hire** — featured `sentinel-1.aegis.eth`, list-a-new-agent form,
  hire cards
- **Hire wizard** — pick → terms → authorize & fund (Privy or MetaMask) → track
- **Pool intel / paid signals / verdicts** — working surface agents actually use

Honesty rule: onchain/RPC/service failures never crash — panels keep
demo-known values and show addresses + "connect" hints.

## Run

```bash
npm install
cp .env.example .env.local
npm run dev   # http://localhost:3000
```

`.env.local`:

- `NEXT_PUBLIC_PRIVY_APP_ID` — required for Sign in / vault / embedded wallet
- `NEXT_PUBLIC_SEPOLIA_RPC` — Sepolia RPC URL
- `NEXT_PUBLIC_AEGIS_REGISTRY` — deployed `AegisRegistry` address
- `NEXT_PUBLIC_SIGNAL_URL` — x402-gated signal service
- `NEXT_PUBLIC_GRAPH_API_KEY` — optional, live subgraph query

Until the registry is a non-zero address, onchain writes run in **"not
deployed yet"** mode: records stay in the vault as pending.

## Typecheck / build

```bash
npx tsc --noEmit
npx next build
```
