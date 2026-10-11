# Varanasi Engineering: how we build and ship

Status: v1, written Oct 11, 2026. Owner (DRI): Bar Raiser role, approved by Ram.
Scope: the Varanasi people app (bank backed digital gold + safe chit funds, Telugu and English) and the contracts, relayer and services behind it. Repo: github.com/Ramprasad4121/varanasi. Board: GitHub Project "Varanasi Roadmap". Chat: Slack #varanasi-* channels in the Hark Bridge workspace.

The team is a set of AI agents, each with one role, plus Ram as the only human with merge, deploy and money authority. This document is the operating system that makes those agents behave like one small, high standard product team.

## 1. What we borrowed, and why

| Practice | Where it comes from | What it means for us |
| --- | --- | --- |
| Working Backwards, PR/FAQ | Amazon. The PR is under one page, the FAQ five pages or less; teams write ten or more drafts; most PR/FAQs never ship, and that is a feature. Source: Bryar and Carr excerpt, https://www.aboutamazon.com/news/workplace/an-insider-look-at-amazons-culture-and-processes | Every feature starts as a short press release written for a villager or a salaried saver, plus FAQ. If the PR cannot say why it is meaningfully better, we do not build it. docs/PRFAQ.md is the product level one. |
| Six page narratives, silent reading | Amazon 2017 shareholder letter: no slides, six page narrative memos read silently at the start of the meeting; great memos take a week or more. https://www.aboutamazon.com/news/company-news/2017-letter-to-shareholders | Design docs (RFCs) are narratives, not bullet dumps. Reviewers read the whole doc before commenting. Scope is coached: a good RFC is rewritten, not dashed off. |
| Two pizza teams | Amazon: teams no larger than two pizzas can feed, with end to end ownership. https://docs.aws.amazon.com/whitepapers/latest/introduction-devops-aws/two-pizza-teams.html | Each feature gets a small squad (PM, Designer, one or two builders, QA) that owns it from PR/FAQ to production. |
| Bar Raiser | Amazon hiring: an objective third party from outside the team who holds the long term bar and can block. https://www.aboutamazon.com/news/workplace/amazon-bar-raiser | We apply it to launches, not hiring: a reviewer agent outside the squad must approve every gate and can block a launch. |
| Operational Readiness Review (ORR) | AWS: curated checklist questions distilled from past incidents, used across the service lifecycle to get shorter, fewer, smaller incidents. https://docs.aws.amazon.com/wellarchitected/latest/operational-readiness-reviews/wa-operational-readiness-reviews.html | Section 6 is our ORR. Every COE adds questions to it. |
| Correction of Error (COE) | AWS: what happened, customer impact, root cause with data, lessons, corrective actions with owners; reviewed by the team and other teams. https://wa.aws.amazon.com/wellarchitected/2020-07-02T19-33-23/wat.concept.coe.en.html | Section 9. Blameless, written within 72 hours of any incident, even with zero user impact. |
| DRI | Apple: every action item has one Directly Responsible Individual named next to it; "Who's the DRI on that?" Source: Adam Lashinsky, Fortune, 2011, https://fortune.com/article/how-apple-works-inside-the-worlds-biggest-startup/ | Every issue, gate and decision has exactly one DRI agent role. A team in the DRI column means nobody. |
| Saying no, few things at a time | Same Fortune piece: Apple focuses on a few things; "the power of picking the things you don't do". | The roadmap has three milestones and a WIP limit (section 5). |
| Human Interface Guidelines, accessibility | Apple HIG: text enlargement to 200%, WCAG AA contrast (4.5:1 normal text, 3:1 large or bold), 44x44 pt controls, never color alone, minimize timed UI, confirm twice before hard to undo actions. https://developer.apple.com/design/human-interface-guidelines/accessibility | docs/DESIGN_PRINCIPLES.md and the a11y bar in section 7. |
| Zero bugs policy | Linear: no bug backlog; fix or "won't fix"; SLA 48 hours high priority, 7 days the rest; weekly bug dashboard. https://linear.app/now/zero-bugs-policy | Section 8. |
| Quality Wednesdays | Linear: every engineer ships one small polish fix a week, under an hour, tracked with a "quality" label; over 1,000 fixes in two years. https://linear.app/now/quality-wednesdays | Every build loop cycle ships at least one `type/polish` fix. |
| Friction logs | Stripe: use the product as a real user would, from where a real user starts, and write down every point of friction in story order. https://github.com/mikeb-stripe/friction-logging-toolkit/blob/main/how-we-use-friction-logs-at-stripe.md | QA and Designer write a friction log per release, starting from a WhatsApp link on a low end phone, in Telugu. |
| Written norms over oral tradition | Stripe: written guides for code review and team practices act as source of truth. https://stripe.com/en-gi/guides/atlas/scaling-eng | This file plus .agents/roles/*.md. Agents have no memory between runs; the docs are the memory. |
| Core Web Vitals | Google: LCP 2.5 s or less, INP 200 ms or less, CLS 0.1 or less at the 75th percentile, mobile. https://web.dev/articles/vitals | Perf budgets in section 7, tightened for 2G/3G and low end Android. |

## 2. Principles (the short list every agent reads first)

1. Customer first, literally. The customer is a first time smartphone user in a Telangana or Andhra village, or a salaried saver in Hyderabad. If a change does not make their money safer or their next step clearer, it waits.
2. Truth over polish. Never claim users, partners, banks, licences or returns we do not have. Every demo surface says "Demo, test money" where money appears.
3. Money invariants are sacred. Gold issued never exceeds gold held. Chit pot math always balances. Any change touching these needs invariant tests and a Security review.
4. One DRI per thing. Name it in the issue.
5. Write it down. Decisions live in PR/FAQs, RFCs, ADR notes in PRs, and COEs, not in chat.
6. Small, reversible steps. Feature branches, small PRs, feature flags for anything user visible.
7. Quality is a habit. Zero bug backlog, one polish fix per cycle, friction log per release.
8. Nothing ships without Ram. Agents open PRs. Only Ram merges to main, deploys, spends money, or talks to a bank, regulator, investor or real user.

## 3. Roles

Each role is an agent with a prompt in `.agents/roles/<role>.md`. One role per agent run. The DRI column in every issue names a role.

| Role | DRI for | Must never |
| --- | --- | --- |
| PM | PR/FAQ, scope, milestone plan, acceptance criteria, issue hygiene, release notes | invent users, partners or numbers |
| Designer | flows, screens, Telugu first copy with Copy reviewer, a11y spec, friction logs | ship a screen without both languages and a 360 px layout |
| Frontend | app/ code, perf budgets, offline behaviour, i18n plumbing, component tests | add crypto words to the UI, add a dependency without a size note |
| Contracts | Solidity, invariants, gas, upgrade and admin paths | merge without fuzz + invariant tests for money paths |
| Security | threat models, security review gate, key handling, relayer abuse, audit log | approve a change to money paths without reading every line |
| QA | test plans, e2e, device matrix, friction log, bug triage rotation | close a bug without a test that would have caught it |
| SRE/DevOps | CI, Docker, environments, deploy runbooks, monitoring, ORR, incident command | deploy or touch secrets without Ram's yes |
| Growth | waitlist, landing copy, investor demo script, field test logistics, metrics | contact real people or post publicly without Ram's yes, or make claims not in PRFAQ |
| Bar Raiser | independent gate reviews, ORR sign off, COE review, keeping this doc current | review work it built; lower a bar to hit a date |

Squad shape per feature: PM + Designer + one or two builders (Frontend and/or Contracts) + QA, with Security and Bar Raiser as reviewers from outside the squad.

## 4. Lifecycle and gates

```
G0 PR/FAQ -> G1 Design doc (RFC) -> Build -> G2 Code review -> G3 Security review -> G4 Quality review -> G5 Launch readiness (ORR) -> Release -> Measure -> COE if anything broke
```

| Gate | Artifact | DRI | Approver | Pass when |
| --- | --- | --- | --- | --- |
| G0 PR/FAQ | `docs/prfaq/<feature>.md` (PR under 1 page, FAQ 5 pages or less) | PM | Bar Raiser, then Ram | customer, problem, "so what" answered; external and internal FAQ; truthful; risks and legal questions listed |
| G1 RFC | `docs/rfc/NNNN-<slug>.md`: context, goals and non goals, user flow, data and contract changes, invariants, threat model sketch, alternatives, rollout and rollback, open questions | builder lead | Security (if money or keys), Designer (if UI), Bar Raiser | alternatives considered; invariants written as testable statements; rollback exists |
| Build | feature branch `feat/<area>-<slug>`, small PRs | builders | | each PR under ~400 changed lines where possible |
| G2 Code review | PR with description, linked issue, screenshots EN + TE at 360 px for UI | builder | one other builder role | CI green, tests added, no TODO without issue |
| G3 Security review | `docs/security/<feature>.md` checklist (section 7) | Security | Bar Raiser | no open High/Critical; keys never on server; relayer limits |
| G4 Quality review | perf report, a11y report, Telugu copy sign off, friction log | QA + Designer | Bar Raiser | every bar in section 7 met or waived in writing by Ram |
| G5 Launch readiness | ORR checklist (section 6), release notes, rollback plan | SRE | Bar Raiser, then Ram | all ORR items yes or waived by Ram |
| Post launch | metrics check at +1 day and +7 days | PM | | |
| COE | `docs/coe/YYYY-MM-DD-<slug>.md` | SRE (incident commander) | Bar Raiser | corrective actions are issues with DRIs and dates |

Small changes (copy fix, polish, dependency bump with green CI) skip G0 and G1 and need G2 plus G4 for UI.

## 5. Planning

- Milestones: **Demo-ready** (investor demo on test money, stable public URL, both languages), **Waitlist launch** (public waitlist, honest landing, field test with 5 to 10 people, Telugu review done), **Bank pilot** (real OTP, device keys, bank partner signing certificates, legal review; nothing real until Ram and counsel say yes).
- Board columns: Backlog, Ready (has DRI, acceptance criteria), In progress (WIP limit: 3 per role), In review, Done.
- Labels: `area/*` (app, contracts, gold, chit, relayer, infra, design, i18n, growth, security, docs), `type/*` (feature, bug, polish, chore, research, needs-ram), `priority/*` (p0 now, p1 this milestone, p2 next, p3 later).
- Issue template: Problem (customer words), Acceptance criteria (testable), DRI role, Out of scope, Links.
- Write issues, not user stories (Linear Method, https://linear.app/method): short, concrete, one outcome.

## 6. Launch readiness (ORR checklist)

Answer each yes, no, or n/a with a link to evidence.

Product and truth
1. PR/FAQ approved and still accurate?
2. Every money screen labelled demo or test money where applicable?
3. No claim of users, partners, banks, licences, returns or regulatory approval that is not true?

Quality
4. All bars in section 7 met, with reports linked?
5. Friction log done on a low end Android (or emulated: 4x CPU slowdown, Slow 3G) in Telugu and English?
6. Zero open p0/p1 bugs on the milestone?

Security and money
7. Security review signed, no open High or Critical?
8. Invariant and fuzz tests green for every touched contract; gold backing and chit pot invariants hold?
9. Admin keys, relayer key and any secret stored outside the repo; rotation documented?
10. Relayer rate limits and per user quotas on; abuse test run?

Operations
11. CI green on the release commit (contracts, app typecheck, build, smoke, e2e)?
12. Rollback tested: previous version redeployable in under 15 minutes; contract pause path tested?
13. Health check, error tracking and uptime alert exist and route to #varanasi-incidents?
14. Runbook for the top 3 failure modes (relayer out of funds, RPC down, app 5xx)?
15. Data: what personal data is stored, where, retention, and how a user deletes it?

Approval
16. Ram said yes to this release in writing?

## 7. Quality bars

Performance (lab, Moto G class profile, Slow 3G, 4x CPU throttle; field once real traffic exists, p75 mobile)
- LCP 2.5 s or less, INP 200 ms or less, CLS 0.1 or less (web.dev thresholds).
- First load JS 170 KB gzipped or less for the home route; total transfer on first visit 500 KB or less including fonts.
- Telugu font: subset and compressed (woff2), only weights used; never block first paint.
- Every action gives visual feedback within 100 ms; a spinner never spins forever (timeout plus plain retry message).

Accessibility (WCAG 2.2 AA, Apple HIG)
- Contrast 4.5:1 body text, 3:1 large or bold text and UI boundaries.
- Touch targets 48x48 dp or larger (Android guidance; HIG 44x44 pt minimum), 8 dp or more between them.
- Works at 200% text size without clipping or horizontal scroll at 360 px width.
- Every icon button has an accessible name in the current language; `html lang` matches the chosen language.
- Status never by color alone (paid, late, fully backed have icon + word).
- No auto dismissing messages for anything about money.
- Hard to undo actions (send gold, take out gold, bid) confirm with the amount in words.
- Screen reader pass with TalkBack on every new screen.

Telugu and English copy
- Every string exists in both languages; CI fails on a missing key.
- Telugu reviewed by a native speaker before Waitlist launch (Ram or a person he names); rural register, no Sanskritised jargon, no English crypto words.
- Numbers: rupees as Rs with Indian grouping (12,34,567), grams with 3 decimals; dates in IST, day month year.
- Reading level: short sentences, one idea each; every error says what happened and what to do next.

Security
- Threat model per feature (STRIDE level is enough), keys created and kept on device, server never sees a private key.
- Relayer: allowlisted targets only, per user and per IP quotas, nonce and deadline checks, funded key in a KMS before any real use.
- Dependencies: lockfile, `npm audit` High/Critical zero or waived, no new dependency without size and maintenance note.
- Contracts: Slither clean or triaged, invariant tests for every money path, admin via multisig + timelock before mainnet.
- Secrets scan (gitleaks) in CI.

Correctness and tests
- Contracts: unit + fuzz + invariant (gold issued 0 or more and never above held; chit pot in = pot out + fees + dividends; no member pays twice per month).
- App: typecheck, unit tests for format and state logic, API smoke, e2e happy paths in both languages, visual snapshots at 360 px.
- A bug fix lands with the test that would have caught it.

## 8. Bugs and polish

- Zero bug backlog (after Linear): every bug is triaged within 24 hours to fix or won't fix. SLA: p0 same day, p1 48 hours, others 7 days.
- QA runs triage; the weekly digest in #varanasi-eng lists open bugs per area.
- Every build loop cycle ships at least one `type/polish` change under an hour (after Quality Wednesdays).

## 9. Incidents and COE

- Severity: SEV1 money or keys at risk or data exposed; SEV2 core flow broken for all users; SEV3 degraded or one flow broken.
- SRE is incident commander: post in #varanasi-incidents, stabilise (pause contracts, stop relayer, roll back), then tell Ram.
- COE within 72 hours, blameless: what happened (timeline in IST), customer impact, root cause with data (5 whys), what went well and badly, lessons, corrective actions as issues with DRI and date, new ORR questions. Reviewed by Bar Raiser and posted to #varanasi-incidents.

## 10. Release process and versioning

- Branches: `main` is protected; only Ram merges. Agents work on `feat/*`, `fix/*`, `docs/*`, `chore/*` branches and open PRs. Never push to main, never force push shared branches, never touch another agent's branch.
- Versioning: SemVer for the app (`app/package.json`), `MAJOR.MINOR.PATCH`; MINOR for user visible features, PATCH for fixes. Contracts are versioned by deployment: each deploy writes `deployments/<network>/<date>.json` with addresses, commit and verifier links. Tags `app-vX.Y.Z` and `contracts-<network>-YYYYMMDD`.
- Release train: weekly cut on Friday IST when there is something to ship; release PR includes changelog, ORR link, screenshots, rollback steps.
- Environments: local (anvil), preview (per PR, test money only), demo (public, test money, waitlist), pilot (only after Bank pilot gate and legal review).
- Feature flags for anything user visible; flags default off in demo until G4 passes.
- Release notes posted to #varanasi-releases in plain English (and Telugu summary for user facing changes).

## 11. Definition of Done

A change is done when all of these are true:
- [ ] Linked issue with DRI and acceptance criteria met
- [ ] Tests added (unit, invariant for money, e2e for flows) and CI green
- [ ] Both languages, 360 px screenshots EN + TE in the PR for UI changes
- [ ] a11y checks pass (contrast, labels, target size, 200% text)
- [ ] Perf budget not exceeded (bundle diff in PR)
- [ ] Security checklist done if it touches money, keys, relayer or personal data
- [ ] Docs updated (APP.md, RFC, runbook, changelog)
- [ ] No em dashes or en dashes in user facing copy or docs written as Ram
- [ ] Reviewed by a role other than the author; Bar Raiser for gates
- [ ] Ready for Ram to merge

## 12. How agents run the loop

1. Pick the highest priority Ready issue in your role (board "Varanasi Roadmap").
2. Read this file, your role file, DESIGN_PRINCIPLES.md, PRFAQ.md and the issue.
3. Post a one line start note in the right Slack channel.
4. Do the work on a branch; open a PR with the template; link the issue.
5. Request the next gate reviewer by role in the PR and in Slack.
6. If blocked on Ram (login, money, legal, real people), label `type/needs-ram`, add it to the Needs You queue, and move on to the next issue.
7. End every run with a short handoff note in the issue: done, not done, next step.
