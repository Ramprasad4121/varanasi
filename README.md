# varanasi
Author: Ramprasad · License: MIT

<p align="center">
  <img src="docs/logo.png" alt="Varanasi Logo" width="140" />
</p>

<p align="center">
  <a href="https://varanasi-five.vercel.app/"><img src="https://img.shields.io/badge/Live%20App-varanasi--five.vercel.app-16a34a?style=flat-square" alt="Live App" /></a>
  <a href="https://sepolia.etherscan.io/"><img src="https://img.shields.io/badge/Contracts-Ethereum%20Sepolia-627EEA?style=flat-square" alt="Network" /></a>
  <a href="https://hashscan.io/testnet"><img src="https://img.shields.io/badge/Micropayments-Hedera%20x402-222222?style=flat-square" alt="Micropayments" /></a>
  <a href="docs/MANDATE.md"><img src="https://img.shields.io/badge/Standard-EIP--712%20Mandates-blue?style=flat-square" alt="EIP-712" /></a>
  <a href="https://privy.io"><img src="https://img.shields.io/badge/Auth-Privy%20Embedded%20Wallets-5C54FF?style=flat-square" alt="Auth" /></a>
</p>

**The enforcement rail for agentic commerce.** Hire autonomous AI agents, lock spending caps in escrow, and release payments strictly on verified proof of work. Agents never custody your private keys.

🌐 **Production Web Application**: [https://varanasi-five.vercel.app/](https://varanasi-five.vercel.app/)

---

## What is Varanasi?

Today's autonomous AI agents move money on loose promises: shared private keys, standing allowances, session credentials, or raw API keys. A single prompt injection, hallucinated address, or compromised tool can instantly drain an entire treasury.

**Varanasi brings cryptographic enforcement directly to the settlement layer:**

1. **Mandate Creation**: A human signs a structured, time-bounded **EIP-712 mandate** specifying an exact spending cap, execution window, expiration timestamp, and replay-prevention nonce. Funds lock securely in a `TaskEscrow` smart contract.
2. **Constrained Execution**: The agent works strictly within these onchain bounds without ever accessing or holding private keys. Replay attacks are cryptographically impossible.
3. **Atomic Settlement & Proof**: An allowlisted validator evaluates the agent's deliverables against onchain thresholds (`RiskGuard`). If the work clears the benchmark, funds are released directly to the merchant. If the benchmark is missed or the mandate expires, 100% of escrowed funds are automatically refunded to the human onchain.
4. **Instant Revocation**: A single transaction revokes the agent's identity via `AegisRegistry`, immediately shutting down all downstream permissions.

Varanasi is a **community product** engineered for humans, DAOs, and autonomous agents alike.

---

## The Four Guarantees ("Zero In The Way")

| Principle | Traditional Agent Setups | The Varanasi Rail |
|---|---|---|
| **Credentials** | Raw private keys or infinite ERC-20 allowances | **Zero standing credentials** — agents hold signed EIP-712 mandates, never keys |
| **Trust Model** | Blind trust in model prompts and API boundaries | **Zero trust in prompts** — checks execute in smart contracts, not LLM context |
| **Replay & Double-Spend** | Vulnerable to replayed instructions and front-running | **Zero double-spend** — nonces nullify on lock; funds stay in escrow until proof |
| **Extensibility** | Closed proprietary agent frameworks | **Zero lock-in** — AP2-shaped mandates, ERC-8004 identity, any x402 payment rail |

---

## Live Deployments & Onchain Proof

Varanasi is deployed and operating live across **Ethereum Sepolia** (contracts & settlement) and **Hedera Testnet** (x402 micropayment rails).

### Canonical Smart Contracts (Ethereum Sepolia)

| Contract | Address | Purpose |
|---|---|---|
| `TaskEscrow` | [`0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24`](https://sepolia.etherscan.io/address/0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24) | Settlement rail for EIP-712 mandates and task escrow |
| `AegisRegistry` | [`0x3913f1E6A0Be93180363aBd01Df7968d494033A8`](https://sepolia.etherscan.io/address/0x3913f1E6A0Be93180363aBd01Df7968d494033A8) | Decentralized subname registry for agent minting & revocation |
| `RiskGuard` | [`0x668c01aE564D51baFF0029D361c20c534d738400`](https://sepolia.etherscan.io/address/0x668c01aE564D51baFF0029D361c20c534d738400) | Onchain risk assessment gate (`authorize(agent, riskScoreBps)`) |
| `AegisHook` | [`0x05043B527D67d7E4e3a2ed411fFBD15b8255c080`](https://sepolia.etherscan.io/address/0x05043B527D67d7E4e3a2ed411fFBD15b8255c080) | Uniswap v4 pool hook for mandate-aware swap authorization |
| `MockERC20` (vUSD) | [`0x6169A84cD7430042fb697c2cC131F663212E8b30`](https://sepolia.etherscan.io/address/0x6169A84cD7430042fb697c2cC131F663212E8b30) | Test stable asset (6 decimals) for simulated escrow funding |

### Verified Onchain Evidence

Real transactions, not mockups. Every entry links directly to public block explorers:

- **Task Escrow Release**: [Etherscan `0x94b44e...eb702`](https://sepolia.etherscan.io/tx/0x94b44e473c0746ed365e8714000ef41a7f21bbc4276c9aca29b9d134651eb702) — Task funded, scored, and released to merchant.
- **x402 Micropayment Leg**: [HashScan `0.0.7162784-1788675749-710110370`](https://hashscan.io/testnet/transaction/0.0.7162784-1788675749-710110370) — $0.01 USDC paid over Hedera HTS for real-time alpha signals.
- **Agent Identity Mint**: [Etherscan `0xaac001...c327`](https://sepolia.etherscan.io/tx/0xaac0018d2906e5773f5c28e14a49e54b02a8c4156f06c6a9473e74ccebc7c327) — Subname `sentinel-1.aegis.eth` minted with 90-day expiry.

Additional verified audit trails can be inspected in [`docs/DEMO.md`](docs/DEMO.md).

---

## Architecture Overview

The Varanasi monorepo unites four production surfaces and one shared type system:

```
                  ┌──────────────────────────────┐
                  │   Human / DAO Web Client     │
                  │   https://varanasi-five...   │
                  │  (Next.js 14 + Privy Auth)   │
                  └──────────────┬───────────────┘
                                 │ signs EIP-712 Mandate
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TaskEscrow Smart Contract                    │
│        (0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24)             │
└──────────────┬───────────────────────────────────┬──────────────┘
               │                                   │
       Escrow  │                                   │  Validates &
       Locks   │                                   │  Releases
               ▼                                   ▼
┌──────────────────────────────┐   x402    ┌──────────────────────────────┐
│     Agent Decision Engine    ├──────────►│   Signal Service (:4021)     │
│   (TypeScript / Viem / MCP)  │  Payment  │ (Express + Hedera Audit Log) │
└──────────────┬───────────────┘           └──────────────┬───────────────┘
               │                                          │
               │ Subgraph Queries                         │ HCS Topics
               ▼                                          ▼
       Uniswap v3 Pools                           Hedera Consensus Service
```

- **`contracts/`**: Core protocol written in Solidity (Foundry). Contains `TaskEscrow`, `AegisRegistry`, `RiskGuard`, `AegisHook`, delegation trees (`MandateTreeEscrow`), and community finance protocols. Tested offline with mock ENS resolution (166 tests).
- **`agent/`**: Autonomous TypeScript orchestration engine. Performs ENS resolution, queries Uniswap pool analytics via The Graph / MCP, pays for alpha through x402 HTTP micropayments, evaluates risk heuristic/LLM models, and signs EIP-712 mandates.
- **`service/`**: Express 5 microservice delivering paid alpha endpoints (`POST /v1/signal`, `POST /v1/score`) protected by x402 payment requirements, alongside deterministic financial simulation APIs and Hedera Consensus Service audit topics.
- **`frontend/`**: Next.js 14 App Router marketplace and treasury dashboard. Features self-custodial onboarding via Privy, 4-step hire wizard, active task ledger, and colosseum-themed typography.
- **`frontend/finance-types/`**: The dependency-free single source of truth for all finance schemas, mirrored directly into `service/` and `agent/`.

---

## Identity & Self-Custody

Varanasi utilizes **Privy** for decentralized, non-custodial authentication:

- **Sign In Flexibility**: Authenticate via email, Google, GitHub, or any Web3 wallet (MetaMask, Coinbase Wallet, WalletConnect).
- **Embedded Wallets**: First-time users without a Web3 wallet automatically receive an embedded, self-custodial Sepolia wallet.
- **Zero Key Custody**: Varanasi never stores, sees, or handles private keys. Your session is cryptographically managed, and local task logs are client-scoped.
- **Data Vault**: Open `/account` to view your personal vault, or `/privy` to access the full Treasury dashboard (mint identities, allocate task allowances, and revoke access).

---

## Community Finance Primitives

Varanasi extends bounded agentic execution into a programmable treasury framework (`/finance`):

- **`SavingsVault`**: Time-locked deposits with configurable yield multipliers.
- **`ChitPool`**: Rotating credit and savings association (ROSCA) pools managed by agents.
- **`LoanAgreement`**: Fixed-term borrowing secured by audited onchain collateral.
- **`CollateralVault`**: Multi-asset escrow supporting tokenized and physical assets.
- **`FinancialReputation`**: Onchain credit scoring updated automatically upon task settlements.
- **`GoldRegistry` & `GoldToken`**: Attestation registry for physical bullion custody.

*Note: All `/finance` frontend routes and `/v1/finance*` endpoints simulate portfolio dynamics deterministically based on wallet address hash. Real funds never move until underlying contracts are finalized.*

---

## Quickstart

### Prerequisites
- **Node.js 24+**
- **Foundry** (`forge`, `cast`) for smart contract operations
- Git

### One-Command Boot (Root Directory)

To launch the full stack locally with health checks:

```bash
# Clone the repository
git clone https://github.com/Ramprasad4121/varanasi.git
cd varanasi

# Start Signal Service (:4021) and Next.js Web App (:3000)
./run.sh
```

To stop all background processes:
```bash
./run.sh stop
```

### Running Individual Packages

#### 1. Web Application (`frontend/`)
```bash
cd frontend
npm install
npm run dev           # Runs Next.js locally on http://localhost:3000
npm run typecheck     # Type checking (ES2017 target)
npm run build         # Production build (passes without requiring environment variables)
```

#### 2. Agent Decision Engine (`agent/`)
```bash
cd agent
npm install
npm run typecheck     # TypeScript compiler check
npm test              # Run vitest suite (162 tests, fully mocked/offline)
npm run build         # Build dist outputs
```

#### 3. Signal Service (`service/`)
```bash
cd service
npm install
npm run dev           # Runs Express on http://localhost:4021 with tsx watch
npm test              # Run node:test suite (5 tests)
npm run build         # Build dist outputs
```

#### 4. Smart Contracts (`contracts/`)
```bash
cd contracts
forge build           # Compile Solidity contracts
forge test            # Execute test suite (166 tests across 10 suites)
```

---

## Using the Agent CLI

Autonomous agents and CLI users can exercise the full decision and mandate lifecycle via `aegis`:

```bash
cd agent

# 1. Analyze a Uniswap pool (ENS identity -> Graph intel -> risk assessment)
npx tsx src/cli.ts analyze \
  --agent sentinel-1.aegis.eth \
  --pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 \
  --skip-pay --no-mcp

# 2. Generate and sign an offline EIP-712 mandate
npx tsx src/cli.ts mandate \
  --agent 0x1234... \
  --merchant 0x5678... \
  --token 0x6169A84cD7430042fb697c2cC131F663212E8b30 \
  --cap 10000000 \
  --window-start 1700000000 \
  --window-end 1700086400 \
  --expiry 1700172800

# 3. Discover ERC-8004 agents across chains
npx tsx src/cli.ts discover --chain base --first 5

# 4. Query Aave lending intel via MCP
npx tsx src/cli.ts lending markets --symbols USDC,WETH
```

For agent developers wishing to embed Varanasi into external coding assistants (Claude, Codex, Cursor), follow the instructions in [`PROMPT.md`](PROMPT.md).

---

## Test & Verification Matrix

All packages maintain strict test hygiene and execute completely offline in CI:

| Layer | Harness | Scope | Offline Safe |
|---|---|---|---|
| **Contracts** | Foundry (`forge test`) | **166 tests** / 10 suites | Yes (mock ENS / zero external RPCs) |
| **Agent** | Vitest (`vitest run`) | **162 tests** / 17 files | Yes (mocked network / simulated crypto) |
| **Service** | Node Test (`tsx --test`) | **5 tests** | Yes (deterministic fixtures) |
| **Frontend** | TypeScript (`tsc --noEmit`) | Next.js 14 App Router | Yes (ES2017 BigInt-safe) |
| **Security** | Gitleaks Action v3 | Entire git history | Yes (zero secrets committed) |

Continuous integration runs on every push and pull request against `main`.

---

## Documentation Index

Explore the detailed architecture and integration manuals:

| Topic | Document |
|---|---|
| **Step-by-Step Tutorial** | [`docs/TUTORIAL.md`](docs/TUTORIAL.md) — First-time human walkthrough |
| **EIP-712 Mandate Spec** | [`docs/MANDATE.md`](docs/MANDATE.md) — Cryptographic mandate structure & typehash |
| **System Architecture** | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Technical deep-dive & flow diagrams |
| **Registry of Facts** | [`docs/REFERENCE.md`](docs/REFERENCE.md) — Addresses, ports, environment variables, commands |
| **Security Review** | [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md) — Threat model, audit status, attack surface |
| **Developer Recipes** | [`docs/HOWTO.md`](docs/HOWTO.md) — Goal-oriented guides (deploy, add rails, wire auth) |
| **Onchain Proof** | [`docs/DEMO.md`](docs/DEMO.md) — Permanent explorer links to verified transactions |
| **Glossary** | [`docs/GLOSSARY.md`](docs/GLOSSARY.md) — Key definitions (x402, mandate, vUSD, chit) |
| **Agent Orientation** | [`AGENTS.md`](AGENTS.md) — Guidelines for autonomous coding agents |
| **Agent Prompt** | [`PROMPT.md`](PROMPT.md) — System prompt for AI coding agents |

---

## Frequently Asked Questions

**Is Varanasi intended for humans or AI agents?**  
Both. Humans set strategic mandates, fund escrows, and retain the cryptographic kill switch. Autonomous agents execute tasks, analyze markets, and coordinate payments strictly within those parameters.

**Does Varanasi hold my custody or private keys?**  
No. Varanasi is entirely non-custodial. Wallets created through Privy are self-custodial, and agents only interact with signed authorizations and escrow contracts.

**What happens if an agent fails to deliver or hallucinates?**  
If the agent fails to submit valid proof before the mandate's expiry timestamp, or if the proof fails validation against `RiskGuard`, the release function cannot be called. The human can call `refund()` on `TaskEscrow` to reclaim 100% of the locked capital.

**What networks are supported?**  
Smart contracts currently operate on Ethereum Sepolia, and micropayments settle on Hedera Testnet via x402. The architecture is chain-agnostic and designed to deploy to Ethereum mainnet, Arbitrum, Base, or Polygon without contract modifications.

---

## License

Author: Ramprasad  
Distributed under the **MIT License**. See `LICENSE` for details.
