# How-to — go-do-it recipes for varanasi

Author: Ramprasad

Goal-oriented. Each recipe assumes you know where to type commands and which
facts to fill in (they're all in [`REFERENCE.md`](REFERENCE.md)). Naming is
consistent with the source: every recipe's "intended result" is checkable.

## 1. Run the whole product locally

```bash
./run.sh            # service :4021 + web :3000; curl -w twice until up
./run.sh agent      # one live agent loop (spends a real $0.01 — opt-in)
./run.sh stop       # kill both
```

Intended result: `GET http://localhost:4021/health` → 200,
http://localhost:3000 renders the marketplace.

## 2. Deploy a contract to Sepolia (Foundry)

Prereqs: `$SEPOLIA_RPC_URL`, a funded deployer key, ENSv2 Sepolia wiring
defaults (see `contracts/README.md`).

```bash
cd contracts
forge build
forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify
# custom ENS wiring (override defaults):
# ENS_REGISTRY=0x… ENS_RESOLVER=0x… UNIVERSAL_RESOLVER=0x… PARENT_NAME=aegis.eth \
#   forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify
```

Intended result: deploy logs new `AegisRegistry` + `RiskGuard` addresses.
**When the deployment moves the addresses, update `frontend/lib/site.ts` +
`docs/REFERENCE.md` in the same change.** Finance contracts (`SavingsVault`,
`ChitPool`, `LoanAgreement`, `CollateralVault`, `FinancialReputation`,
`GoldRegistry`) deploy via the same flow once ready; until then agent
`execute()` intentionally throws.

## 3. Add a new payment rail (x402)

`service/src/server.ts` handles both USDC and HBAR legs via the facilitator.
To add a third asset:

1. Confirm the asset is transferable on Hedera testnet (like USDC
   `0.0.429274`) and the receiver account is associated.
2. `service/src/` — extend the payment requirements in the paid-route
   builder (`/v1/signal`, `/v1/score`); the payer's x402 client picks an asset
   its wallet can fund.
3. Add a route test in `service/test/` (node:test pattern, e.g.
   `finance.test.ts`).
4. `npm run typecheck && npm test` inside `service/`.
5. Update the route table in `service/README.md` + `docs/REFERENCE.md`.

Intended result: a third asset appears in `/402-info` preview and settles via
the facilitator.

## 4. Add a new onchain demo agent (hire path)

Hiring runs through `agent/src/workers/` — mirror one existing worker:

1. Create `agent/src/workers/<name>.ts` (typed like `scout.ts` / `analyst.ts` /
   `freelancer.ts`) with a `run(mandate)` emitting machine-readable JSON.
2. Register it in `agent/src/cli.ts` `hire` command.
3. Add `agent/src/workers/<name>.test.ts`; keep it mocked-fetch offline.
4. `npm run typecheck && npm test` (vitest).
5. Expose a hire card in `frontend/app/agents` + `/hire` if it should be a
   site offering; keep copy user-facing (no internals).

Intended result:
`npx tsx src/cli.ts hire --agent <name> --cap 10 --window-hours 24` prints a
mandate-shaped JSON result.

## 5. Wire a fresh deployment's Privy sign-in

1. Create an app at [dashboard.privy.io](https://dashboard.privy.io).
2. `cp frontend/.env.example frontend/.env.local`; set
   `NEXT_PUBLIC_PRIVY_APP_ID`.
3. Verify: **Sign in** in the nav, then `/account` shows your identity +
   embedded wallet. Without the key, the rest of the site still runs (by
   design — CI builds with no env).

Intended result: a visitor signs in with email/Google/GitHub/wallet and the
vault (per-account on this browser) migrates in and is yours alone on this machine.

## 6. Verify locally (the exact CI gates)

```bash
cd contracts && forge build && forge test
cd ../agent && npm run typecheck && npm test
cd ../service && npm run typecheck && npm run build && npm test && node --test test/adversarial_service.test.mjs
cd ../frontend && npm run typecheck && npm run build
```

Intended result: everything green offline — no keys, no RPCs, no wallets.

## 7. Rotate or restore secrets

```
# back up after any secret change (re-encrypt all three):
for f in .env service/.env agent/.env; do
  openssl enc -aes-256-cbc -pbkdf2 -pass file:$HOME/.config/varanasi/.enc-key \
    -in "$f" -out "$f.enc"
done
# restore on a new machine:
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:$HOME/.config/varanasi/.enc-key \
  -in service/.env.enc -out service/.env && chmod 600 service/.env
```

Full procedure, key-file rules, rotation: [`KEYS.md`](KEYS.md).

## 8. Ship a repo change the CI-happy way

1. `git checkout -b <subject>` from `main` (main is PR-protected).
2. Make small, single-purpose commits.
3. `./run.sh` gates locally first (the four typechecks + tests in
   [`REFERENCE.md`](REFERENCE.md) §6).
4. Push the branch; open a PR. CI runs contracts/agent/service/frontend/
   gitleaks. Merge after the 5 checks pass.

Intended result: green 5-check CI, mergeable PR, `docs/REFERENCE.md` still
matches the tree.