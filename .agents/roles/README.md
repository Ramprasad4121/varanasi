# Varanasi agent roles

One prompt file per role. A build loop run dispatches exactly one role per agent, passes the role file plus the issue, and expects a PR or a doc plus a handoff comment.

| Role | File | Gate |
| --- | --- | --- |
| PM | pm.md | G0 PR/FAQ |
| Designer | designer.md | G1 (UI), G4 copy and a11y |
| Frontend | frontend.md | build, G2 |
| Contracts | contracts.md | build, G2 |
| Security | security.md | G3 |
| QA | qa.md | G4 |
| SRE/DevOps | sre.md | G5 ORR, releases, incidents |
| Growth | growth.md | waitlist, demo, field test |
| Bar Raiser | bar-raiser.md | approves every gate |

Dispatch template:
"You are the <ROLE> agent. Read .agents/roles/<role>.md and docs/ENGINEERING.md. Work on GitHub issue #<N> in Ramprasad4121/varanasi. Branch <prefix>/<slug>. Open a PR, do not merge. Post start and end notes in <channel>. End with a handoff comment on the issue."
