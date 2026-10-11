# Varanasi people app (gold savings, gold loans, chits)

Status: DEMO ONLY, branch `hark/people-app`. Not deployed, not launched, no users, no
bank partner. Test money only. Not for real money or real gold.
Who it is for: common people in rural Telangana and Andhra, and salaried savers (for
example software engineers). Easy and trustworthy: plain Telugu or English, rupees and
grams, big text and big buttons; the screens never say wallet, gas, token, blockchain or crypto.

## Run it (one command)

```
scripts/app-demo.sh            # local chain + contracts + demo story + app on http://localhost:3100
scripts/app-demo.sh --check    # same, then the API smoke test (app/scripts/smoke.mjs), stop
scripts/app-demo.sh --e2e      # same, then also the browser walk-through of every flow (app/e2e/e2e.py), stop
scripts/app-public.sh          # PUBLIC demo mode on :3200: no chain, test ledger in the browser (Vercel build)
scripts/app-public.sh --check  # waitlist test + demo ledger test + browser walk-through in public mode
```

Needs Foundry (forge, anvil), Node 18+ (22.18+ for the public mode unit checks) and npm.
`--e2e` / public `--check` also need `pip install playwright==1.48.0 && python3 -m playwright install chromium`.
First run does `npm install --ignore-scripts` and `next build` (about 2 minutes). The app
rebuilds by itself when any app source is newer than the last build (`REBUILD=1` forces it).
Investor click path: `docs/INVESTOR_DEMO.md`. App README: `app/README.md`. Public deploy steps: `docs/DEPLOY_PUBLIC.md`.

Sign in: on the landing tap "Try the demo", then "Use demo account (Ravi)", or type
98765 43210; the code 123456 is shown on screen (no SMS). Other demo phones: 90000 00001
Lakshmi, 90000 00002 Srinivas, 90000 00003 Anitha, 90000 00004 Venkatesh. Any other 10
digit number gets a new empty account.

Demo story after seeding (the chain clock starts 6 days in the past so dates read naturally):
- Ravi holds 12.450 g of pure gold (certificate MB-AMP-GD-2026-000101, 995 purity) at "Mock Bank, Ameerpet branch (demo)". Lakshmi and Anitha hold gold too. The mock bank may hold at most 1,000 g for the app (per-bank cap).
- Ameerpet monthly chit: 5 members, Rs 2,000 a month, pot Rs 10,000, sealed bid auction. Month 1 won by Lakshmi with the lowest bid Rs 8,500 (Srinivas bid Rs 9,000). Rs 1,500 discount: Rs 500 foreman fee (5% cap), Rs 1,000 shared, Rs 250 each. Month 2 is open and Ravi has not paid.
- Teachers savings chit: 4 members, Rs 1,000 a month. 3 have joined; Ravi's join starts month 1.
- Loans: the mock bank loan desk lends demo rupees against pledged gold: up to 75% of today's demo value, 2.22% for 90 days (about 9% a year, by the day).
- Every demo person has Rs 50,000 of demo rupees and 0 network money: all their actions go through the relayer.

## Screens

| Screen | What it shows | What you can do |
| --- | --- | --- |
| Banner (every screen) | "LOCAL DEMO · test money on this computer" or "PUBLIC DEMO · test money in your browser" | |
| Landing | what Varanasi is (gold at a bank, chits with clear rules, loan against gold), "Not launched yet: needs a partner bank and a legal review", "names, banks and amounts are made up" | Try the demo, Join the waitlist, language |
| Waitlist | name, mobile or email, town, interest (gold / chits / both), consent | join; checks the form in plain words; says plainly if the waitlist is not open |
| Sign in | phone number, demo code shown on screen | sign in (mock), change number, demo account |
| Home | my gold in grams and rupees (demo price) and grams pledged for a loan, next payment due (red when late, with fee), running gold loan with amount to repay and date, my chits, shortcuts | Pay now, open loan, proof, sign out; public mode: Start the demo again |
| Gold | my grams and value, bank certificates | deposit steps, send, take out, loan, proof |
| Gold: how to put gold in | 5 steps at the partner bank, jewellery counts only for pure gold | Demo bank counter: tests and keeps 10 g of 22 carat (9.160 g pure), signs a certificate |
| Gold: send | balance, phone, grams, rupee estimate | send by phone number, no charges; refuses more than you hold |
| Gold: take out | balance, branch, my requests with status | ask the bank; Demo: bank hands over gold |
| Gold: is my gold really there? | per bank: bank holds, app shows to all people, waiting to be handed over, bank limit for the app, Fully backed (or red: new deposits stopped), value; every certificate | read only |
| Gold: loan against gold | lender, up to 75% of value, about 9% a year, 90 days, what happens if not repaid; my loans with status (Waiting for bank, Approved, Running with amount to repay now and date, Repaid, Not repaid, Cancelled); gold locked without a request | pledge grams and ask; cancel and get gold back; take the money; repay and get gold back; get unused pledge back; Demo: bank approves; Demo: 90 days pass, not repaid |
| Chits | my chits; groups that invited me | join |
| Chit | you pay each month, pot, month X of N, status, fee cap; pay (late fee if late); sealed bid; open my bid; my dividend, pot kept safe, ready to take; who won and why each month with all bids; members and paid status; missed payment notes (excluded, or "paid from your kept pot" for a winner); what if I miss a payment | pay, seal bid, open bid, take money; Demo: move to next step; Demo: add Rs 10,000 test money |
| Receipts | every action: title, amount, to, date and time (IST, ledger clock), reference no. ("Demo reference" in public mode), "No charges for you" | open any receipt |

Language: the top right button switches Telugu and English on every screen; the choice is
remembered. Errors appear as a red bar above the bottom menu, in plain words; nothing is
taken when an action is refused.

## How it works

- Contracts (contracts/src): `BankGoldIssuer` (bank-signed EIP-712 deposits, 1 unit = 1 g fine gold, any-holder redemption, proof of reserve, per-bank mint cap), `GoldToken`, `GoldRegistry`, `MockGoldPriceFeed`, `ChitFund` (fixed, draw or sealed bid auction; 5% foreman cap; escrow-backed winner liability; late fee; exclusion), `CollateralVault` + `LoanAgreement` (gold loans; gasless subclasses `GaslessCollateralVault`, `GaslessLoanAgreement` in `src/app`), `MockRupee`, `VaranasiForwarder` (OpenZeppelin ERC2771Forwarder).
- Gasless: the phone signs an EIP-712 ForwardRequest; `/api/relay` submits it with a relayer key and pays the fee. The forwarder checks signature, nonce and deadline, so the relayer can delay a request but never change it or act for someone else (tests: `test/app/ChitGasless.t.sol`, `test/app/GoldLoanGasless.t.sol`, `test/gold/GoldApp.t.sol`).
- Before anything is signed, `/api/prepare` dry runs the call as the person, so a wrong action fails at once with a plain message and nothing is sent. A refusal comes back as HTTP 200 `{ error: CODE }` (so the browser console stays clean); only a broken setup is 5xx.
- Sealed bids: the phone makes a random salt and keeps bid + salt on the device; only the hash is recorded. "Open my bid" (or the demo step) reveals it.
- Gold loan: three signed steps in one tap (allow the vault to take the grams, lock them, ask for the loan). If the phone stops halfway, the locked grams show as "locked but no loan" with a button to take them back (`reclaimUnusedPosition`). Repay uses `repayAll`, which charges the exact balance at that second (interest moves every second) with a 1% ceiling.
- `/api/state` reads everything one person sees in one call. `/api/prepare` only builds: send gold, take gold out, reclaim, allow chit payments, join, pay, bid, open bid, take money, and the loan actions. `/api/relay` only forwards to the gold issuer, gold record, rupee, collateral vault, loan contract and the deployed chits. Chain reads are never cached by Next.js (`cache: "no-store"`; an older version could show stale balances from `.next/cache`).
- Public demo mode (`NEXT_PUBLIC_VARANASI_MODE=public`): `app/lib/sim/engine.ts` keeps one JSON ledger in the visitor's browser and answers with the same `AppState` (`app/lib/types.ts`) and the same error names. Each step runs on a copy and is kept only if it succeeds, like a reverted transaction. Checked with the same story and numbers as the chain (`app/scripts/sim-test.mjs`). The local chain routes answer 404 in this mode and on Vercel.
- Waitlist: `/api/waitlist` (POST add, GET list with `Authorization: Bearer $WAITLIST_ADMIN_TOKEN`). Store: Upstash Redis REST when `KV_REST_API_URL`/`KV_REST_API_TOKEN` are set; a local file `runtime/waitlist.jsonl` off Vercel; otherwise "not configured" and nothing saved.
- App code: `app/` (Next.js 14, React 18, viem, plain CSS). Words: `app/lib/i18n.ts`. Screens: `app/components/`. Seed: `app/scripts/seed.mjs`.

## What is mocked (must change before real users)

- Phone sign-in (mock OTP): any number, code always 123456 and shown on screen; locally the server derives the device key from the phone number and hands it to the browser. Real: SMS OTP from a licensed provider, key created and kept on the phone (secure enclave or passkey), recovery flow, device binding. The server must never know a key.
- The bank (mock bank): one anvil key signs deposit certificates, one confirms hand overs, one lends. No real bank, assay, locker, KYC, Aadhaar or credit check. The demo "bank approves" lends up to 75% of the demo value with no other check.
- Gold price: fixed Rs 12,000.00 a gram, display only, labelled demo. Not a market quote. Loan limits use it; a real loan needs a real INR gold price and a liquidation rule.
- Rupees (mock rupee): `MockRupee` balances / browser numbers stand in for money in the person's bank. Real chit and loan money must move through a regulated rail (bank account, UPI escrow, or an RBI approved instrument). "Demo: add Rs 10,000 test money" mints play money.
- Loan default: in the demo the bank keeps the whole pledge. A real gold loan must sell or value the gold and give back anything above what is owed (and follow RBI gold loan rules). Not built.
- Time: a chit "month" is 3 days to pay + 2 days late + 1 day to open bids; demo buttons move the clock (chit steps, and the 90 day loan jump, which also moves chit dates; use it last).
- Other members: the demo step makes the other members pay, place random sealed bids and open them. It never acts for the signed in person, except opening their own sealed bid with the salt stored on their own device.
- Receipts are kept on the device; the reference number points to the record on the local chain (public mode: a demo reference).
- Relayer: one key pays all fees from anvil play money. Real: funded relayer with rate limits and abuse checks.
- Telugu text was written by Hark and needs review by a native speaker before any user sees it.

## Checks (Oct 11, 2026, from a clean clone)

- forge test: 354 passed, 0 failed, 23 suites (343 before + 11 new in `test/app/GoldLoanGasless.t.sol`).
- app: `tsc --noEmit` clean (also with `--noUnusedLocals --noUnusedParameters`), `next build` passes in local and public mode.
- `scripts/app-demo.sh --e2e`: API smoke test 32/32 (adds gold loan pledge, approve, draw, repay, 75% cap refusal, cancel, unused pledge reclaim), browser walk-through 19/19 on the local chain, zero browser console errors.
- `scripts/app-public.sh --check`: waitlist 14/14 (API + Upstash REST path against a fake Upstash server), demo ledger 44/44, browser walk-through 19/19 in public mode.
- Screenshots (phone size, English and Telugu): `docs/screens/`.

## Not built yet (see docs/BACKLOG.md)

Real OTP and device keys, bank partner integration, UPI rails, real gold price and loan
liquidation (and surplus return on default), partial loan repayment screen, foreman
console, SMS/WhatsApp reminders, offline mode, voice help in Telugu, accessibility audit,
pause switch for new loans, legal review (SEBI digital gold, RBI gold loans, Chit Funds Act 1982 and State rules, DPDP Act for the waitlist).
