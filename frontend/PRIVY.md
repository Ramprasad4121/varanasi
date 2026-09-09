# varanasi identity — Privy

Author: Ramprasad

Privy is how a community member signs in and keeps a wallet without installing
MetaMask. Email / Google / GitHub / wallet → self-custodial embedded Sepolia
wallet → hire, mint, fund, revoke. One signature per action. **Private keys
never touch Varanasi servers or tables.**

The provider is mounted once in the site layout (`components/PrivyRoot.tsx`):

- Nav **Sign in** (`components/AuthSlot.tsx`)
- `/account` — vault keyed by Privy user id
- `/privy` — treasury dashboard
- Hire wizard — uses the same session to sign mandates

## 1. Privy dashboard setup (~5 min)

1. Go to `https://dashboard.privy.io` → sign up → **Create app**.
2. **Login methods**: enable **Email**, **Google**, **GitHub**, and **Wallet**.
   Embedded wallets are enabled in code (`createOnLogin: 'users-without-wallets'`).
3. **Allowed origins**: add `http://localhost:3000` and your deployed URL.
4. Copy the **App ID**.

Apple is not used. Google + email cover the same job, and a wallet is created
automatically so hiring does not depend on an extension.

## 2. Env vars

In `frontend/`:

```bash
cp .env.example .env.local
```

`.env.local`:

- `NEXT_PUBLIC_PRIVY_APP_ID=<paste App ID>` — required for sign-in. Without it
  the rest of the site still works; Sign in sends you to `/account` with setup
  instructions and never mounts the SDK.
- `NEXT_PUBLIC_AEGIS_REGISTRY=<deployed address>` — optional; without it the
  treasury runs in local mode.
- `NEXT_PUBLIC_SEPOLIA_RPC=<rpc url>` — optional; falls back to viem default.

Fund the embedded wallet with SepoliaETH from a faucet (address shown on
`/account`) before a live hire.

## 3. What the user sees

1. **Sign in** in the nav → email code, Google, GitHub, or an existing wallet.
2. Embedded wallet auto-created; `/account` shows the address + vault.
3. **Hire** uses that wallet to sign the mandate. The hire is saved to the vault.
4. `/privy` for treasury ops: mint agent, fund, approve task, revoke.

## 4. Data rules

- Vault keys: `varanasi.<privyUserId>.aegis.*`
- Guest data (no sign-in) stays on the guest keys and is copied into the vault
  the first time that user signs in.
- Never persist private keys, seed phrases, or raw passwords.

## 5. Notes

- Contract ABI in `treasury.tsx` is verified against
  `contracts/src/AegisRegistry.sol`.
- `@privy-io/react-auth` may need `npm install --legacy-peer-deps` against this
  repo’s `viem` range.
- Nested `PrivyProvider`s are avoided: layout owns the only provider.
