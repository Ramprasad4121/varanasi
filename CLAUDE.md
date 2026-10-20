@AGENTS.md

## Claude Code

- AGENTS.md above is the source of truth for every coding agent. Edit AGENTS.md, not this file, unless a rule is Claude Code specific.
- Use plan mode for changes that touch more than one file, and always for `contracts/` and any money or chit logic.
- Use a subagent for wide codebase research and for an adversarial review of your diff before opening the PR; ask it for correctness and requirement gaps only.
- Do not run with permission checks skipped on this repo.
