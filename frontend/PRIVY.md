# varanasi Privy Treasury — `/privy`

Author: Ramprasad

Privy-powered financial flow for varanasi: email/social login → embedded self-custodial wallet on
Sepolia → human mints agent subnames with spend allowances → treasury ops (fund, approve task,
revoke). One signature per action; onchain complexity hidden behind treasury buttons.

Route files (new, self-contained — no existing frontend files touched):

- `frontend/app/privy/page.tsx` — App-ID gate + `PrivyProvider`
- `frontend/app/privy/treasury.tsx` — login, wallet + Sepolia balance, mint/fund/revoke, ops log

## 1. Privy dashboard setup (human, ~5 min)

1. Go to `https://dashboard.privy.io` → sign up → **Create app**.
2. In app settings → **Login methods**: enable **Email** (+ Google/GitHub for the social path).
   Embedded wallets are enabled in code (`createOnLogin: 'users-without-wallets'`), no dashboard
   toggle needed.
3. **Allowed origins**: add `http://localhost:3000` (and your deployed URL later).
4. Copy the **App ID** (looks like `cm…`).
5. Optional for this demo: nothing else — Sepolia is pinned in code via `switchChain(11155111)`.

## 2. Env vars

In `frontend/`:

```bash
npm install @privy-io/react-auth   # NOTE: peer-resolve may need --legacy-peer-deps (viem/ox)
cp .env.example .env.local
```

`.env.local`:

- `NEXT_PUBLIC_PRIVY_APP_ID=<paste App ID>` — required for `/privy`; without it the route shows
  setup instructions and never touches the SDK.
- `NEXT_PUBLIC_AEGIS_REGISTRY=<deployed address>` — optional; without it the route runs in **local
  mode** (funding still works as plain SepoliaETH transfers; mint/revoke saved pending + synced
  after deploy).
- `NEXT_PUBLIC_SEPOLIA_RPC=<rpc url>` — optional; falls back to viem default.

Fund the embedded wallet with SepoliaETH from a faucet (address shown after login) before funding
agents.

## 3. Demo click-path (30 sec)

1. Open `http://localhost:3000/privy` → **Log in with Privy** → email code (or Google).
2. Embedded wallet auto-created; note treasury address + Sepolia balance.
3. **Authorize agent**: sublabel `sentinel-1`, agent wallet `0x…`, 90 days → **Mint agent + set 0.05
   ETH allowance** → approve in Privy prompt → `sentinel-1.aegis.eth` row appears.
4. **Fund 0.01 ETH** → approve → progress bar moves, receipt logged with Etherscan link.
5. **Approve task 0.005** → approve → spend-vs-allowance updates (this is the per-call agent budget
   story for x402).
6. Switch role to **operator**: mint/revoke/allowance-edit blocked with reasons; funding still works
   within allowance (B2B: owner approves, operator runs).
7. **Revoke** (as owner) → identity killed onchain; further funding blocked.

## 4. Prize mapping — ETHOnline Privy $5k "Best financial flow / B2B financial product"

Target track: **best financial flow** — funding, moving, and trading digital assets where Privy
wallet actions hide onchain complexity.

- **Funding**: `Fund agent 0.01 SepoliaETH` — one-button native transfer from the embedded treasury
  wallet to the agent wallet; user never sees gas, chain switching (`switchChain` pinned to Sepolia
  in code), or calldata.
- **Moving**: `Mint agent` bundles identity + budget (`mintAgent(sublabel, wallet, expiryDays)` on
  `AegisRegistry` + local allowance ledger) behind a single Privy signature.
- **Trading-adjacent**: `Approve task` models per-call agent spend (the x402 micropayment budget) as
  an allowance-counted transfer with receipts.
- **B2B flavor**: team roles — owner approves (mint/revoke/allowance), operator runs (fund within
  allowance); spend-vs-allowance bars + ops log read as a small-business treasury dashboard.

Qualification checklist coverage:

- [x] Privy SDK (`@privy-io/react-auth` 3.x) is load-bearing: login, embedded wallet, all signatures
- [x] Email + social login methods configured
- [x] Self-custodial embedded wallet (user owns keys via Privy recovery), Sepolia
- [x] Real asset movement on Sepolia (native transfers + registry writes), Etherscan-linked receipts
- [x] Graceful degradation: no App ID → setup instructions, never crashes; no registry → local mode
- [x] `npx tsc --noEmit` green in `frontend/`

## 5. Notes / gotchas

- Contract ABI in `treasury.tsx` is verified against `contracts/src/AegisRegistry.sol`: `mintAgent`
  takes **expiry days** (not a timestamp), revoke-by-label is `revokeAgentByLabel`, and reads go via
  `tokenByLabelHash`/`isAuthorized` (there is no `agentOf(string)`).
- Install note: `@privy-io/react-auth@3.40.0` vs the repo's `viem 2.x (ox)` needs
  `npm install --legacy-peer-deps` in this repo; types verified against the installed package.
- Nothing here modifies the main dashboard (`app/page.tsx` read-only context) or commits anything.
