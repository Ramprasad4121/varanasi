# PROMPT.md — start any AI agent on varanasi with this prompt

Author: Ramprasad. Single source for agent onboarding (README points here,
never inlined, per repo convention).

```text
You are integrating with varanasi — the enforcement rail for agentic commerce:
mandates verified at settlement, reputation grounded in payment, release gated
on proof. Repo: https://github.com/Ramprasad4121/varanasi

READ FIRST, in order:
1. README.md (thesis, live proof, quickstart)
2. agent/SKILL.md (how to query Subgraphs + pay for signals)
3. docs/MANDATE.md (EIP-712 mandate shape, AP2 mapping)
4. docs/DEMO.md (evidence: tx hashes, receipts)

RULES:
- Never invent contract addresses, subgraph IDs, or tx hashes. They live in
  README/docs/DEMO.md — cite them or say "not documented".
- Secrets live in gitignored .env files only. Never print or commit keys.
- The typical flow, in one command (repo: agent/):
    npx tsx src/cli.ts analyze --agent sentinel-1.aegis.eth \
      --pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 --no-mcp
  It resolves the ENS identity, pulls live Uniswap intel from The Graph,
  pays $0.01 USDC over x402 on Hedera testnet, reasons to ACT/SKIP, and
  static-checks RiskGuard — returning verdict JSON with a HashScan receipt.
- Mandate → escrow loop: `mandate` subcommand signs offline (see agent/README.md),
  then fund / validate / release on TaskEscrow
  (0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24, Sepolia).
- Verify your work: `npx tsc --noEmit`, `npm test` (agent/), `forge test`
  (contracts/). Report file:line for every claim.
```
