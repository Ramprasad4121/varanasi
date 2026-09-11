<!-- Author: Ramprasad — the repo's PR gate, in checklist form. -->

## What breaks without this?

## How is it tested?
- [ ] `contracts`: `forge test` green **offline** (mock-mode registry) — or N/A
- [ ] touched suites: agent `npm test` / service `node --test` / frontend `npm run build`
- [ ] money-layer change ⇒ EVM-harness parity rerun (`docs/ARCHITECTURE.md` § Verification)
- [ ] invariant added/changed ⇒ numbered line + failing test in `contracts/README.md` § Invariants

## GitHub law
- [ ] Conventional commits / title (`feat(scope): …`)
- [ ] No secrets, no `.env*`, no force-push, CI green before ready
- [ ] `CHANGELOG.md` § Unreleased updated (one line is enough)

## Weight audit
Files added: · removed: · new deps (should be none):
