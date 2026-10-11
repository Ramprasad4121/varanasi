# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com),
commits follow [Conventional Commits](https://www.conventionalcommits.org).

## [Unreleased]

### Added
- People app (`app/`): bank held gold in grams and rupees, send by phone number, take gold
  out, proof of reserve, chit funds with sealed bids, gold loans, receipts, Telugu and English.
- Public demo mode: the same screens on a test ledger kept in the visitor's browser.
- Waitlist with an opt in weekly update and a signed unsubscribe link.
- Gold loan contracts for the app (`GaslessCollateralVault`, `GaslessLoanAgreement`) with
  unit tests and a new invariant suite (vault holds exactly the open pledges, gold and
  rupees conserved, loan contract solvent).
- Tooling: API smoke test, demo ledger test, waitlist test, Playwright walk-through on a
  360 px phone screen with axe-core accessibility checks, Docker image and compose stack,
  CI workflow, pre-commit hooks, Dependabot for the app.
- Multi-asset (`contracts/src/assets/`, docs/ASSETS.md): silver and platinum on a per-metal
  bank issuer with an asset registry; pledge receipts and loans for vehicles, land papers and
  jewellery sets; a bank asset desk for auctions of repossessed items. Unit, fuzz and
  invariant suites. App: Silver, Pledge an item and Bank asset desk screens on a browser test
  ledger, with unit tests and a phone walk-through.

### Changed
- UI pass: clear balance card with a "fully backed" trust line, one primary action per
  screen, line icons instead of emoji, official gold V logo, darker green and grey for
  contrast, loading skeleton and empty states.

- A plain deploy with no settings now builds the public demo (test money in the browser).
  The local chain demo needs `NEXT_PUBLIC_VARANASI_MODE=local`, which `scripts/app-demo.sh`
  sets. Demo routes answer 404 unless the build is local and the host is localhost.

### Fixed
- Lending L1/L2 (borrower must lock the position; only the named lender funds).
- `CollateralVault.lock` writes the position before the token transfer and refuses tokens
  that deliver less than the amount (fee on transfer). Slither reentrancy-no-eth.

### Not done (see docs/BACKLOG.md)
- Real sign in, bank partner, rupee rail, gold price oracle and liquidation, legal review.
