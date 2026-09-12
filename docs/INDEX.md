# Docs index — varanasi

Author: Ramprasad

The map for the README. One line per doc, grouped by what it answers.
Automated readers: `docs/llms.txt` in the same directory is the machine
version of this page.

## Start here

| Doc | Answers |
|---|---|
| [`README.md`](../README.md) | What is varanasi? How do I try it / hire an agent / fork it? |
| [`GLOSSARY.md`](GLOSSARY.md) | What do the terms mean (mandate, x402, vUSD, chit…)? |
| [`TUTORIAL.md`](TUTORIAL.md) | Walk me through the first full use of the product. |
| [`REFERENCE.md`](REFERENCE.md) | Give me the exact facts: addresses, ports, env, commands, tests. |

## Understand

| Doc | Answers |
|---|---|
| [`MANDATE.md`](MANDATE.md) | How does one escrowed task work, end to end? (EIP-712 spec — type string LOCKED) |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How do the four surfaces fit together? (flows, contracts, data ownership) |
| [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) | What are the security properties and the known review status? |

## Operate

| Doc | Answers |
|---|---|
| [`HOWTO.md`](HOWTO.md) | How do I deploy a contract / add a payment rail / wire Privy…? |
| [`DEMO.md`](DEMO.md) | What onchain proof exists? (Etherscan / HashScan links) |
| [`AKSHAYA.md`](AKSHAYA.md) | How does settlement-derived reputation work? |
| [`GHATSTREAM.md`](GHATSTREAM.md) | How does continuous (per-second) escrow work? |
## In-repo sources of truth (mirror these, don't drift)

| Path | Owns |
|---|---|
| `AGENTS.md` | The agent contract (orientation, rules, commands — single source) |
| `SECURITY.md` | Report channel + isolation model |
| `contracts/README.md`, `agent/README.md`, `service/README.md`, `frontend/README.md` | Per-surface commands + conventions |

When an address, route, command, port, or test count changes anywhere, update
`REFERENCE.md` in the same change — it is the single registry of facts.