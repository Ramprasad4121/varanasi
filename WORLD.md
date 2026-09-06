# WORLD.md — World Selfie Check × varanasi

varanasi = human-authorized agents. Abuse vector: **one human minting unlimited
agents / granting high allowances**. World Selfie Check (Beta) is the
abuse-prevention signal: a low-friction selfie credential (device-camera
liveness + facial similarity, **no Orb needed**, Sandbox-testable).

- Credential: https://docs.world.org/world-id/credentials/11
- IDKit presets: https://docs.world.org/world-id/idkit/credentials
- Sandbox testing: https://docs.world.org/world-id/sandbox/testing-selfie-check

## 1. Integration flow

```
Human wallet (frontend/app/human/)
  │ 1. "Verify humanity" → IDKit widget, selfieCheckLegacy() preset
  │    (World ID 3.0 Face proof; responses[].identifier === "selfie")
  ▼
World App: enrollment (new) or face match (returning) → proof returns
  │ 2. IDKit result JSON pasted/forwarded (never verified client-side)
  ▼
Backend: agent/src/human.ts verifySelfieProof(proof, { rpId, action })
  │ 3. POST proof AS-IS → https://developer.world.org/api/v4/verify/{rp_id}
  ▼
Nullifier (RP+action-scoped unique-human id) → store with UNIQUE constraint
  │ 4. tierFor(nullifier, verified) → tier + limits
  ▼
verified → up to 10 agents, 50% allowance │ guest → 1 agent, 5% allowance
```

Files owned by this integration (do not edit anything else):

| File | Role |
| --- | --- |
| `agent/src/human.ts` | `verifySelfieProof()` wrapper (configurable verifier, sandbox flag) + pure `tierFor()` |
| `agent/src/human.test.ts` | vitest: tier policy + sandbox verify |
| `frontend/app/human/` | "Verify humanity" route → tier + limits, labeled guest mode |
| `WORLD.md` (this file) | Flow, sandbox setup, tier policy, prize feedback section |

Replay rule: a nullifier may be consumed once per action. Enforce a UNIQUE
constraint on storage; a second proof with the same nullifier for the same
action must not raise limits again.

## 2. Tier policy

| Tier | Condition | maxAgents | maxAllowanceBps |
| --- | --- | --- | --- |
| `verified` | Selfie Check proof accepted by verifier + nullifier stored | 10 | 5000 (50%) |
| `guest` | Everything else (unverified, no proof, nullifier missing) | 1 | 500 (5%) |

`verified` strictly dominates `guest` on both knobs. `tierFor` fails closed:
`verified=true` with an empty/missing nullifier still returns `guest`.
Source of truth: `GUEST_TIER` / `VERIFIED_TIER` in `agent/src/human.ts`;
the frontend route carries a labeled mirror (browser code can't import the
agent package — keep the two in sync manually).

## 3. Sandbox setup (for the human orchestrator)

Selfie Check (Beta) is **access-gated**: request the feature flag for your app
via your World point of contact / `developers@toolsforhumanity.com` before
testing. A valid app/action alone does not imply Selfie Check access.

1. **Sandbox App**: World Developer Portal → create app → enable Sandbox,
   note `app_id` + `rp_id`. Request the Selfie Check (Beta) flag for the app.
2. **Action**: create action `aegis-human` (this scopes nullifier uniqueness).
   Generate/store the RP signing key immediately.
3. **Env**:
   - `agent/`: `WORLD_RP_ID=<rp_id>`, `WORLD_ACTION=aegis-human`,
     `WORLD_SELFIE_SANDBOX=1` (local only — never in production).
   - `frontend/.env.local`: `NEXT_PUBLIC_WORLD_APP_ID=<app_id>`,
     `NEXT_PUBLIC_WORLD_ACTION=aegis-human`, `NEXT_PUBLIC_WORLD_SANDBOX=1`.
4. **Test users**: install the sandbox World ID build (TestFlight on iOS /
   private Play testing link on Android), create a sandbox account (date of
   birth + invite code on iOS cold flow), enroll a sandbox selfie.
5. **Run**: `npm run dev` in `frontend/` → `/human` → "Verify humanity" (web =
   cross-device QR; complete on the phone) → tier card should show Verified
   (sandbox badge). Or "Simulate sandbox proof" for the no-phone path.
6. **Coverage to hit**: Hot (enrolled → face match), Cold (install → account →
   DOB → invite code → enroll → check), Semi-cold (reinstall/recover → check).
   Note: iOS Semi-cold is limited (no invite-code path after "Sign in" —
   restart from a fresh QR); Android is the reliable Semi-cold surface.

## 4. Feedback document (prize requirement)

> TODO (orchestrator): fill §4.1 after a live Sandbox run — needs a human with
> the sandbox World ID build. Integration-side notes (§4.2–4.5) are filled.

### 4.1 Sandbox test notes — TODO

- [ ] Date/time, tester device(s) + OS, entry surface (web QR / native deep link)
- [ ] Hot / Cold / Semi-cold outcomes (pass/fail + wall-clock time each)
- [ ] Proof payload observed (`responses[].identifier`, credential returned)
- [ ] Errors hit (code + screen + recovery path)
- [ ] `/human` tier card state after each run (screenshot)

### 4.2 Docs flow (filled from integration)

Followed `credentials/11` → `idkit/credentials` → `sandbox/testing-selfie-check`.
The credential page explains *what* Selfie Check is; the actual preset name
(`selfieCheckLegacy`), the World ID 3.0 Face-proof detail, and the verify
endpoint (`api/v4/verify/{rp_id}`) live in the IDKit/skill docs — three hops
to assemble one integration. A single "Selfie Check end-to-end" page (preset
→ widget → verify → nullifier) would remove the hop.

### 4.3 Portal nav (filled from integration)

App → RP → action → signing key is well-guided, but the Selfie Check feature
flag has no visible state in the portal we could find: you can't tell whether
the flag is on until a proof fails. A per-app "credentials enabled" checklist
(Orb / Passport / Selfie / Identity) would save a support round-trip.

### 4.4 Sandbox states/errors (filled from docs, needs live confirmation)

State model (Hot / Cold / Semi-cold) is clearly tabled per entry surface.
Known doc'd gotchas: iOS Semi-cold reinstall/login dead-end, platform-split
invite-code handling, store builds not publicly listed (TestFlight/private
Play link). Error-code catalog for failed proofs (`user_presence_failed`
excepted) is thin — TODO: record exact codes seen live in §4.1.

### 4.5 What was confusing (filled from integration)

1. **Two names for one thing**: "Selfie Check (Beta)" vs preset
   `selfieCheckLegacy` vs proof identifier `selfie` vs legacy alias `face`.
   Four labels; the mapping is only spelled out in the skill doc.
2. **Assurance wording drift**: "medium-assurance" (credential page) vs
   "low-assurance" (IDKit credentials table) for the same credential.
3. **Silent gating**: access-gated + flag-gated, but nothing in code or portal
   surfaces the flag state — failures look like integration bugs.
4. **v4 vs legacy**: Selfie Check is World ID 3.0-only ("4.0 support rolling
   out soon") while surrounding IDKit docs push v4 sessions — the version
   boundary is easy to straddle by accident.
