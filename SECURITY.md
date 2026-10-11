# Security policy

## Status

Everything in this repository is a demo or a testnet build. The people app runs on a
local chain or a browser test ledger with test money. There is no mainnet deployment,
no real gold, no real rupees and no bank partner. Do not send real funds to any address
in this repository.

## Reporting a vulnerability

Please report privately through GitHub's "Report a vulnerability" (Security tab, private
vulnerability reporting) on this repository. Do not open a public issue for a security
problem. Include the affected file or contract, steps to reproduce, and the impact.

We aim to reply within 3 working days and to fix confirmed issues in the contracts before
any deployment that holds value.

## Scope

- `contracts/src` (gold issuer, chit fund, collateral vault, loan agreement, forwarder)
- `app/` API routes (relayer, prepare, waitlist)

Known limits (mock sign-in, mock bank signer, single relayer key, no rate limits beyond
the waitlist) are listed in `docs/APP.md` and are not considered vulnerabilities in the
demo, but reports on how they would fail in production are welcome.
