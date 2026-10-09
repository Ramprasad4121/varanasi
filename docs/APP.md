# Varanasi people app (gold savings + chits)

Status: LOCAL DEMO ONLY, branch `hark/people-app`. Not deployed. Not for real money or real gold.
Who it is for: common people in rural Telangana and Andhra, and salaried savers (for example software engineers). It must be easy and trustworthy, so the screens use plain Telugu or English, rupees and grams, big text and big buttons, and never say wallet, gas, token, blockchain or crypto.

## Run it

```
scripts/app-demo.sh            # chain + contracts + demo data + app on http://localhost:3100
scripts/app-demo.sh --check    # same, then runs the API smoke test (app/scripts/smoke.mjs) and stops
APP_BUILD_DIR=/tmp/people-app scripts/app-demo.sh   # build the app in a copy (slow or full disk)
```

Needs Foundry (forge, anvil), Node 18+ and npm. First run does `npm install --ignore-scripts` and `next build` (about 2 minutes).
Sign in: tap "Use demo account (Ravi)", or type 98765 43210 and code 123456. Other demo phones: 90000 00001 Lakshmi, 90000 00002 Srinivas, 90000 00003 Anitha, 90000 00004 Venkatesh. Any other 10 digit number gets a fresh empty account.

Demo story after seeding:
- Ravi holds 12.450 g of pure gold (certificate MB-AMP-GD-2026-000101, 995 purity) at "Mock Bank, Ameerpet branch (demo)". Lakshmi and Anitha hold gold too, so the bank total is larger than Ravi's.
- Ameerpet monthly chit: 5 members, Rs 2,000 a month, pot Rs 10,000, sealed bid auction. Month 1 was won by Lakshmi with the lowest bid Rs 8,500 (Srinivas bid Rs 9,000). Rs 1,500 discount: Rs 500 foreman fee (5% cap), Rs 1,000 shared, Rs 250 each. Month 2 is open and Ravi has not paid.
- Teachers savings chit: 4 members, Rs 1,000 a month. 3 have joined; Ravi's join starts month 1.
- Every demo person has Rs 50,000 of demo rupees for chit payments and 0 network money: all their actions went through the relayer.

## Screens

| Screen | What it shows | What you can do |
| --- | --- | --- |
| Sign in | phone number, 6 digit code | sign in (mocked), demo account button |
| Home | my gold in grams and rupees (today's demo price), next payment due with date (red when late, with fee), my chits with month and paid status, shortcuts to "Is my gold really there?" and receipts | Pay now jumps to the chit |
| Gold | my grams and value, my bank certificates (number, pure grams, purity, date) | open deposit steps, send, take out, proof |
| Gold: how to put gold in | 5 steps at the partner bank (Aadhaar, assay in front of you, locker + printed certificate, grams appear, anyone holding grams can take gold back), note that jewellery counts only for pure gold | Demo bank counter: bank tests and keeps 10 g of 22 carat (9.160 g pure) and signs a new certificate |
| Gold: send | balance, phone number, grams, rupee estimate | send to any phone number, no charges |
| Gold: take out | balance, branch, grams; list of my requests with status (Waiting at bank, Gold handed over, Cancelled grams returned) | ask the bank; Demo: bank hands over gold |
| Gold: is my gold really there? | per bank: bank holds X g, app shows to all people X g, waiting to be handed over, green "Fully backed" (red and "new deposits stopped" if not), value of gold at bank; plain explanation; every bank certificate | read only |
| Chits | my chits; groups that invited me with monthly amount, pot, members joined, foreman, "fee never more than 5%" | join a group |
| Chit | amount, pot, month X of N, status, fee cap; pay this month (amount, due date, late fee if late); place a sealed bid (allowed range, hidden until opening); open my bid; my dividend (total so far, pot kept safe for remaining months, ready to take); who won and why for every month (winner, amount taken, left in pot, foreman fee, shared dividend each, all bids opened together); members with paid status; "What if I miss a payment?" in 4 simple lines with the real late fee | pay, seal bid, open bid, take money to bank; Demo: move to next step; Demo: add Rs 10,000 |
| Receipts | every action with title, amount, to, date and time (IST), reference no. (VR-XXXX-XXXX-XXXX from the on-chain record), "No charges for you" | open any receipt |

Language: the top right button switches Telugu and English on every screen; the choice is remembered.

## How it works

- Contracts (contracts/src): `BankGoldIssuer` (bank-signed EIP-712 deposit attestations, 1 unit = 1 g pure gold, any-holder redemption, proof of reserve), `GoldToken`, `GoldRegistry`, `MockGoldPriceFeed`, `ChitFund` (fixed, draw or sealed bid auction; 5% foreman cap; escrow-backed winner liability; late fee; exclusion), `MockRupee`, `VaranasiForwarder` (OpenZeppelin ERC2771Forwarder).
- Gasless: the phone signs an EIP-712 ForwardRequest; `/api/relay` submits it with a relayer key and pays the fee. The forwarder checks signature, nonce and deadline, so the relayer can delay a request but never change it or act for someone else (tested: `test/app/ChitGasless.t.sol`, `test/gold/GoldApp.t.sol`). `ChitFund` and `MockRupee` became ERC-2771 aware on this branch (forwarder is a constructor argument).
- Before anything is signed, `/api/prepare` dry runs the call as the person, so a wrong action (paying twice, bidding outside the range, bidding after time) fails at once with a plain message and nothing is sent.
- Sealed bids: the phone makes a random salt and stores bid + salt on the device; only the hash goes on record. "Open my bid" (or the demo step) reveals it in the opening window.
- `/api/state` reads everything one person sees in one call. `/api/prepare` only builds these actions: send gold, take gold out, reclaim, allow chit payments, join, pay, bid, open bid, take money. `/api/relay` only forwards to the gold issuer, gold record, rupee and the deployed chits.
- App code: `app/` (Next.js 14, React 18, viem, plain CSS). Words: `app/lib/i18n.ts`. Screens: `app/components/App.tsx`. Seed: `app/scripts/seed.mjs`. Smoke test: `app/scripts/smoke.mjs`.

## What is mocked (must change before real users)

- Phone sign-in: any number, code always 123456, and the server derives the device key from the phone number and hands it to the browser. Real: SMS OTP from a licensed provider, key created and kept on the phone (secure enclave or passkey), recovery flow, device binding. The server must never know a key.
- The bank: "Mock Bank, Ameerpet branch (demo)" is one anvil key that signs deposit certificates and one key that confirms hand overs. No real bank, assay, locker, KYC or Aadhaar check.
- Gold price: fixed Rs 12,000.00 a gram, display only, labelled demo on screen. Not a market quote.
- Rupees: `MockRupee` balances stand in for money from the person's bank. Real chit money must move through a regulated rail (bank account or UPI escrow with the foreman's bank, or an RBI approved rupee instrument). The "Add Rs 10,000 (demo)" button mints play money.
- Time: a chit "month" is 3 days to pay + 2 days late window + 1 day to open bids, and the demo button jumps time forward. Real chits run monthly with dates the foreman publishes.
- Other members: the demo step makes the other 4 members pay, place random sealed bids and open them. It never acts for the signed in person, except opening their own sealed bid with the salt stored on their own device.
- Receipts are kept on the device (browser storage); the reference number points to the record on the local chain.
- The relayer key pays all fees from anvil play money. Real: a funded relayer with rate limits and abuse checks.
- Telugu text was written by Hark and needs review by a native speaker before any user sees it.

## Checks done (Oct 9, 2026)

- forge test: 343 passed, 0 failed (gold 300 + chit + lending fixes + gasless chit).
- app: `tsc --noEmit` clean, `next build` passes.
- `scripts/app-demo.sh --check`: 24 of 24 API checks pass (sign in, home, pay, sealed bid, open, month settles to lowest bid, dividend, take money, join, send gold, take gold out, bank hands over, bank deposit, proof fully backed, plain error, zero network money for the user).
- Visual QA: 12 phone size screenshots (English and Telugu) in docs/screens, taken with headless Chromium. Emoji icons show as boxes there (no emoji font in that browser); replace with SVG icons before field tests.

## Not built yet (see docs/BACKLOG.md)

Lending against gold in the app (contracts fixed, no screen yet), real OTP and device keys, bank partner integration, UPI rails, foreman console (create a chit, invite members), push and SMS reminders before due dates, offline and low bandwidth mode, voice help in Telugu, accessibility audit, legal review (SEBI digital gold, Chit Funds Act 1982 and State rules).
