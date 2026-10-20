## What changed

## Why

## How it was tested
- [ ] `forge test` (contracts)
- [ ] `npx tsc --noEmit` and `npx next lint` (app)
- [ ] `next build` in local and public mode
- [ ] `scripts/app-demo.sh --check` (API smoke) / `--e2e` (browser walk-through)
- [ ] `scripts/app-public.sh --check` (waitlist, demo ledger, walk-through)

## Known gaps / risks

## Checklist
- [ ] Test money only: no real users, money, gold or bank claims in copy
- [ ] No wallet, gas, token, blockchain or crypto words on screens people see
- [ ] English and Telugu strings added together (`app/lib/i18n.ts`)
- [ ] No secrets, keys or personal data in the diff
