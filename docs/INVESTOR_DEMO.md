# Investor demo (5 minutes)

Test money only. No real gold, rupees or bank. Say so up front.

## Two ways to run it

- Hosted public demo: open the live link on a phone. Tap "Try the demo".
- Laptop, full chain demo: `scripts/app-demo.sh`, then open http://localhost:3100 in a
  narrow window. Sign in with 98765 43210, code 123456 (Ravi).

## The story

1. Landing: "Gold savings and chits you can check yourself". Show the waitlist.
2. Home: Ravi has 12.450 g of pure gold at a partner bank, shown in grams and rupees,
   with the "fully backed" line.
3. Save gold: the bank counter adds 10 g of 22 carat jewellery, 9.160 g pure.
4. Proof: bank holds X g, app shows X g, fully backed. Certificates listed.
5. Send 1.5 g to a phone number. Try 500 g: refused in plain words.
6. Chit: pay this month, place a sealed bid, open bids, Ravi wins month 2 with the
   lowest bid, dividend goes to the bank.
7. Loan: pledge 5 g, bank approves, take Rs 40,000, repay, gold comes back.
8. Switch to Telugu. Every screen changes.

## What is real and what is not

- Real: the contracts (forge tests, invariants), the rules a member sees, gasless actions,
  the receipts, the waitlist.
- Mocked: the bank, the gold price, the rupee, phone sign-in. A bank partner, a rupee
  rail and a legal review come before any real user.

Screens: `docs/screens/after/` (public demo, 360 px phone).
