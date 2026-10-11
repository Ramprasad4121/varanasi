# Varanasi Engineering: how we build and ship

Status: v1.1, Oct 11, 2026 (v1 approved by Ram; v1.1 adds sections 13 and 14 on Apple and Anthropic practice). Owner (DRI): Bar Raiser role.
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

Sections 13 and 14 go deeper on two companies we copy on purpose: Apple for how a product gets polished and shipped, Anthropic for how a team of AI agents builds software safely.

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
- Issue template: Problem (customer words), Acceptance criteria (testable), Verification check (the command or screenshot that proves it), DRI role (exactly one), Stage (Proto, EVT, DVT, PVT), Out of scope, Links.
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
- [ ] Verification evidence pasted in the PR: the command run and its output, or screenshots (section 14)
- [ ] Evals added and green for any AI feature (section 14)
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
4. Explore, then write a short plan in the issue (skip for one line fixes). For money logic, write the failing test first.
5. Do the work on your own branch and worktree; run the issue's verification check; open a PR with the template, the evidence and the linked issue.
6. Request the next gate reviewer by role in the PR and in Slack. The reviewer is a fresh run that did not write the code.
7. If blocked on Ram (login, money, legal, real people), label `type/needs-ram`, add it to the Needs You queue, and move on to the next issue.
8. End every run with a short handoff note in the issue: done, not done, next step.

## 13. What we take from Apple

Apple does not publish its internal process. What follows comes from Apple University's own article (Podolny and Hansen, HBR 2020, hosted by Apple), Adam Lashinsky's reporting in "Inside Apple" (2012) as summarised by TNW and Fortune, AppleInsider's reporting on prototype stages, and Apple's public Human Interface Guidelines. Items marked (reported) come from journalists, not Apple, and may be dated.

| Apple practice | Source | Varanasi rule, gate or agent behavior |
| --- | --- | --- |
| Functional org: experts lead experts, and the people with the most expertise in a domain hold the decision rights for it | HBR via Apple: https://www.apple.com/careers/pdf/HBR_How_Apple_Is_Organized_For_Innovation-4.pdf | Decision rights follow the role, not seniority or who wrote the code. Designer decides UI and copy questions, Contracts decides Solidity design, Security decides key and relayer questions, PM decides scope. A builder who disagrees writes the case in the PR; the owning role decides; Ram breaks a tie. |
| Leaders know the details "three levels down"; immersion in the details | Same HBR article | Reviewers read every line they approve and open the running preview. No approval from a PR description alone. Bar Raiser verdicts must cite a specific file, screen or test result. |
| Collaborative debate: strong, well grounded views, changed when evidence is better; separate how right a path is from how hard it is | Same HBR article | In reviews, argue with evidence (screenshot, test, metric, user quote) and say "I changed my mind" when beaten. "Too hard" is never a reason to drop the better user experience; it is a reason to resize scope or move the date, decided by PM and Ram. |
| Accountability without control: the DRI owns the outcome even when other teams do the work | Same HBR article | The issue DRI chases the other roles it depends on, by name, in the issue and Slack. A blocked dependency is the DRI's problem to escalate, not an excuse. |
| Zero artifacts, corner cases count, and a feature can slip a year rather than ship flawed (portrait mode was deferred to the next release) | Same HBR article | Corner cases are bugs, not edge trivia: Telugu glyph clipping, 200% text, lakh grouping, a chit month with a late payer, offline mid payment. A feature with a known artifact on a money screen does not ship; PM moves the date instead. |
| Pixel level polish (continuous "squircle" corners, exact manufacturing tolerance) | Same HBR article | Every UI PR includes EN and TE screenshots at 360 px and at 200% text; Designer checks spacing, alignment, truncation and contrast at pixel level before G4. Polish fixes are first class work (`type/polish`). |
| DRI on every action item | Fortune (Lashinsky 2011): https://fortune.com/article/how-apple-works-inside-the-worlds-biggest-startup/ | Already principle 4. Now enforced: an issue cannot move to Ready without exactly one DRI role in its body, and every launch milestone has one too (see Rules of the Road below). |
| ANPP: a written process that maps every stage of a product, who owns it, who works on it and when it is done (reported) | TNW summary of Lashinsky: https://thenextweb.com/news/this-is-how-apples-top-secret-product-development-process-works | Section 4 is our ANPP. Each feature's RFC lists its stages, owners and target dates. Agents do not invent their own process per feature. |
| Executive team reviews every product every Monday, so no product is more than about two weeks from a key decision (reported) | Same TNW article | Weekly Design and Product Review, every Monday IST, led by Designer and Bar Raiser (details below). Rule: no in flight feature goes more than two weeks without a recorded decision (continue, change, cut, ship). |
| Rules of the Road: the launch plan listing every milestone to launch day, each with a DRI; kept on need to know (reported) | Same TNW article; Fortune: https://fortune.com/article/the-secrets-apple-keeps/ | Every launch gets `docs/launch/<feature>.md`: milestones to release day, one DRI each, date, status. SRE owns the file; PM keeps dates honest. |
| Prototype stages Proto, EVT, DVT, PVT, MP, each with exit criteria; earlier units run internal builds | AppleInsider: https://appleinsider.com/articles/24/06/26/inside-apple-hardware-prototype-and-development-stages | Our software analogue, mapped onto the gates in section 4 (table below). A build cannot skip a stage. |
| Small segregated teams, need to know, leaks treated as a firing offence (reported) | TNW and Fortune above | We are an open repo, so code is not secret. Need to know applies to: keys and secrets, investor and partner conversations, personal data of waitlist users, and any unannounced bank or partner name. Agents never paste these into PRs, issues, Slack or logs. Truth rule still wins: we keep things private, we never say false things. |
| Human Interface Guidelines and accessibility first | Apple HIG: https://developer.apple.com/design/human-interface-guidelines/accessibility | Already in section 7 and DESIGN_PRINCIPLES.md. Now a G1 rule: the RFC for any UI feature must include its a11y spec (labels, focus order, target sizes, 200% text, TalkBack script) before build starts, not after. |

### Software EVT, DVT, PVT (our build stages)

| Stage | Question it answers | Where it runs | Exit criteria | Gate |
| --- | --- | --- | --- | --- |
| Proto | Is this the right idea and does the tech work at all? | throwaway branch `proto/<slug>`, local or preview | one working path end to end; what we learned written in the issue; code may be thrown away | G0 PR/FAQ, G1 RFC drafted |
| EVT (engineering validation) | Does the engineering work? | preview per PR | all functions work in English; unit, fuzz and invariant tests green; CI green | G2 code review |
| DVT (design validation) | Is the full design right for Lakshmi and Ravi? | preview per PR, throttled phone profile | both languages, 360 px, 200% text, a11y spec met, friction log done, perf budget met; design frozen | G3 security, G4 quality |
| PVT (production validation) | Can we run it safely in public? | demo environment, release candidate | ORR all yes or waived, rollback rehearsed, dogfood checklist passed, launch plan complete | G5 launch readiness |
| MP (release) | Ship | demo (test money) or pilot (only after Bank pilot gate) | Ram's written yes | Release |

Late changes: a change found in DVT or PVT that alters design or money logic sends the feature back to EVT. Copy and polish fixes can land in PVT.

### Weekly Design and Product Review (Mondays IST)

- Led by: Designer (product and craft) and Bar Raiser (bar and process). PM brings the list, SRE brings ops status. Ram attends when he wants; decisions that need him get `type/needs-ram`.
- Input: every in flight feature, pre-read posted by Sunday in #varanasi-design: current stage, screenshots EN and TE at 360 px, friction log or demo link, open questions. Read silently first (section 1, six page narratives).
- Output: one decision per feature, written in the issue: continue, change (what), cut, or ship to next stage. Any feature not reviewed this week is first on next week's list, so nothing waits more than two weeks.
- The review can send work back a stage. It cannot lower a bar; only Ram waives a bar, in writing.
- Notes go to docs/REVIEW_LOG.md with date, attendees (roles), decisions and DRIs.

## 14. What we take from Anthropic

How Anthropic builds with Claude Code, from its own docs, engineering blog and team interviews. These matter more for us than for most teams, because our builders are AI agents.

| Anthropic practice | Source | Varanasi rule, gate or agent behavior |
| --- | --- | --- |
| Give the agent a check it can run (tests, build, screenshot); show evidence, not claims; "if you can't verify it, don't ship it" | Claude Code best practices: https://www.anthropic.com/engineering/claude-code-best-practices | Every issue has a verification command or check in its acceptance criteria. An agent's PR must paste the command it ran and the result (test output, build log, screenshot). "Looks done" is not done. |
| Explore, then plan, then code, then commit; skip the plan only when the diff fits in one sentence | Same | Agents read the code and write a short plan in the issue before touching more than one file. One line fixes skip the plan. |
| Test driven work: Security Engineering moved from "design doc, janky code, give up on tests" to pseudocode plus test driven development | How Anthropic teams use Claude Code: https://www.anthropic.com/news/how-anthropic-teams-use-claude-code | For money paths, contracts, chit math and format functions: write the failing test first, commit it, then make it pass. Bug fixes start with a failing test that reproduces the bug. |
| Writer and reviewer in separate contexts; an adversarial review subagent sees only the diff and the criteria, and flags only gaps that affect correctness or requirements | Claude Code best practices | The agent that wrote a PR never approves it. Reviews run as a fresh agent run given the diff, the issue and this doc, told to report correctness and requirement gaps, not style preferences. |
| Subagents for investigation keep the main context clean; scope investigations narrowly | Same | Big reads (whole package audits, dependency research) go to a separate research run that returns a short summary to the issue. |
| Parallel sessions in isolated git worktrees so edits do not collide | Same | One agent, one branch, one worktree. Never edit another agent's worktree. Two agents never work the same issue at once. |
| CLAUDE.md: short (target under 200 lines), only what the agent cannot guess, pruned regularly, checked into git; Claude Code reads AGENTS.md, and a CLAUDE.md can import it with `@AGENTS.md` | Claude Code memory docs: https://code.claude.com/docs/en/memory | Repo root AGENTS.md holds agent conventions for every tool; CLAUDE.md imports it. When an agent makes the same mistake twice, add one line to AGENTS.md. Bar Raiser prunes it monthly. |
| Hooks for rules that must hold every time, because instructions are advisory | Claude Code best practices and memory docs | Anything that must never happen is a CI check, not a sentence: missing i18n key, em or en dash in copy or docs, secrets (gitleaks), bundle budget, lint. A rule broken twice gets a check. |
| Evals for agents: start early with 20 to 50 tasks from real failures; unambiguous tasks with reference solutions; balanced sets (should and should not); grade outcomes, not paths; capability vs regression suites; read transcripts; pass^k for customer facing reliability | Demystifying evals for AI agents: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents | Any AI feature (an LLM call in the product, a support or advice bot, an agent tool) ships with `evals/<feature>/`: at least 20 tasks, each with a reference answer, both languages, should and should not cases (for example: never give investment advice, never promise returns). Regression suite near 100% runs in CI; G4 cannot pass without it; Bar Raiser reads a sample of transcripts before G5. |
| Dogfood first ("ant fooding"): new features go to employees first, with a feedback channel and a quality threshold before external users; unship what people do not like | Cat Wu and Boris Cherny on AI and I: https://every.to/podcast/transcript-how-to-use-claude-code-like-the-people-who-built-it | Every feature runs the dogfood checklist (below) on the demo with test money before Ram sees it as a release candidate. Features nobody uses in dogfood get cut, not polished. |
| Prototype fast and throw it away to learn what you actually mean | Same interview; Claude Code best practices (rewind and try again) | Proto stage (section 13) exists for this. Throwaway code is cheap; a wrong spec is expensive. |
| Simplest solution first; workflows before autonomous agents; add complexity only when it measurably helps | Building effective agents: https://www.anthropic.com/engineering/building-effective-agents | No agent framework or multi step LLM chain in the product without an eval showing it beats the simple version. Prefer plain code over an LLM when plain code works. |
| Tools are a contract with a non deterministic agent: few, clear, namespaced tools; meaningful names over ids; helpful errors; poka-yoke the inputs | Writing tools for agents: https://www.anthropic.com/engineering/writing-tools-for-agents ; Building effective agents appendix | Scripts our agents use (scripts/, Makefile targets) take explicit, absolute arguments, print a clear next step on failure, and have one obvious job each. |
| Responsible Scaling Policy: do not deploy unless safeguards proportional to the risk are in place; capability thresholds trigger stronger safeguards; documented assessments | RSP announcement: https://www.anthropic.com/news/announcing-our-updated-responsible-scaling-policy | Varanasi Launch Levels (below). A release names its level, and it does not ship unless every safeguard for that level is in place. |

### Varanasi Launch Levels (our RSP style launch gate)

| Level | What is exposed | Required before release |
| --- | --- | --- |
| VL0 | docs, internal tools, no users | G2 code review |
| VL1 | public demo, test money only, no personal data | all gates G2 to G5; "Demo, test money" labels on every money screen; dogfood checklist passed |
| VL2 | real people's personal data (waitlist, phone numbers), still no real money | VL1 plus: data map and retention (ORR 15), deletion path, privacy text reviewed by Ram, Security review of storage and access, Ram's written yes |
| VL3 | real money or real gold | VL2 plus: bank partner and legal sign off, external smart contract audit, multisig and timelock on admin, KMS held relayer key, incident runbook rehearsed, Ram's written yes. Not allowed until the Bank pilot milestone |

Security owns the level assessment for each release and writes it in the release PR. Bar Raiser checks it. Moving up a level always needs Ram.

### Dogfood checklist (every feature, before PVT exit)

- [ ] Three or more role agents used the feature end to end on the demo as a user would, starting from a shared link, in Telugu and English, on the throttled phone profile.
- [ ] Each wrote friction points in story order in the feature issue (red, yellow, green).
- [ ] Every red item is fixed or the feature is held. Yellow items have issues with DRIs.
- [ ] Money flows checked: amounts, receipts and history match on every screen; "Demo, test money" visible.
- [ ] Offline and slow network tried mid flow; nothing double charged or lost.
- [ ] One person who did not build it (Ram, or a person he names) tried it before the release goes public, when available.
- [ ] Decision recorded: ship, fix first, or unship.
