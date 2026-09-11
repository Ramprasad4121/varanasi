# Test Infrastructure Specification: Varanasi E2E Test Suite

## 1. Overview & Architecture
The Varanasi E2E Test Suite provides an opaque-box, requirement-driven verification harness for the integrated Varanasi product. Varanasi connects smart contracts on Sepolia (`contracts/`), an x402-gated alpha/risk microservice on Hedera testnet (`service/`), an autonomous agent automation engine (`agent/`), and a Next.js 14 web application inspired by Colosseum (`frontend/`).

The test harness exercises the entire system across four hierarchical tiers:
1. **Tier 1: Feature Coverage** — Verifies core features in isolation against authoritative contracts and specifications (>=5 tests per feature).
2. **Tier 2: Boundary & Corner Cases** — Stresses boundary conditions, extreme values, empty inputs, type mismatches, and overflows (>=5 tests per feature).
3. **Tier 3: Cross-Feature Combinations** — Validates pairwise interactions, state transitions between contracts and agents, and cross-stack communication.
4. **Tier 4: Real-World Application Scenarios** — Executes complete end-to-end user journeys using a headless Chromium browser powered by Playwright, strictly enforcing zero console errors, zero uncaught page errors, and interactive UI verification across all routes.

---

## 2. Four-Tier Testing Methodology

### Tier 1: Feature Coverage (Isolation, >=5 tests/feature)
- **F1 (TaskEscrow 14-field ABI Synchronization)**: Confirms full 14-field tuple output, mapping `state` to index 13, `pinnedThresholdBps` to index 11, `pinnedValidator` to index 12, and correct decoding of all 6 state enum values.
- **F2 (Backend & Agent Port Alignment)**: Confirms default port 4021 alignment across service configuration, agent environment fallback, and health check endpoints.
- **F3 (Agent Test Sandboxing)**: Validates test isolation configuration preventing upward directory traversal in sandboxed environments.
- **F4 (Backend Service CORS Alignment)**: Verifies CORS preflight handling, origin allowlisting for `http://localhost:3000`, allowed headers (`Content-Type`, `X-402-Payment`), and response headers.
- **F5 & F6 (Frontend Infrastructure & Colosseum Tokens)**: Verifies Next.js offline font optimization disabling (`optimizeFonts: false`), Tailwind v3.4 setup, and Colosseum color/typography tokens (`#1c1b18`, `#f3f2ee`, `#c01010`, `Newsreader` serif).
- **F7 & F8 (Colosseum Primitives & SiteShell Layout)**: Verifies core UI primitives (`Diamond`, `Badge`, `BrandButton`, `DisplayHeading`, `PageHero`, `SectionSep`, `SiteShell`), header navigation, and 4-column footer layout.
- **F9 & F10 (Modular Homepage & Dedicated Routes)**: Verifies route structures for `/`, `/activity`, `/agents`, `/hire`, catalog filtering, and 4-step hire wizard state definitions.
- **F11 & F12 (Web3 & Secondary Pages)**: Verifies EIP-712 mandate signing contracts, domain separator, and secondary route views (`/account`, `/human`, `/mandate`, `/proof`, `/privy`).
- **F16 (Security & Secrets Management)**: Asserts zero credential leakage in git-tracked files, proper `.env` permissions (mode 600), absence of private keys in client logs, and receipt sanitation.

### Tier 2: Boundary & Corner Cases (>=5 tests/feature)
- **Escrow & Contract Boundaries**: Maximum `uint256` caps, zero amounts, expired time windows (`windowEnd < windowStart`), zero address validators, invalid state mutations, and tuple length bounds.
- **Backend Service Boundaries**: Invalid symbol schemas (lowercase, missing slash, non-alphabetic chars, oversized lengths >20 chars), empty POST bodies, malformed JSON, payload size limits (256KB), rate limiting headers (`Retry-After`), and invalid Hedera transaction ID formats.
- **Agent Boundaries**: Missing or unresolvable ENS names (`nonexistent.aegis.eth`), malformed Ethereum pool addresses, missing environment variables, empty signal queries, and invalid private keys.
- **Mandate EIP-712 Boundaries**: Expired timestamps, future `windowStart`, chain ID mismatch (not 11155111), zero nonces, and invalid verifying contract addresses.
- **Frontend Boundaries**: Missing wallet connection states, empty search inputs in agent catalog, out-of-range wizard step indices, network retry resilience, and receipt pagination limits.

### Tier 3: Cross-Feature Combinations (Pairwise Interactions)
- **Escrow-to-Agent Settlement**: Verifies interaction between TaskEscrow's 14-field state output and the Freelancer worker's state decision engine (State 1 -> pending, State 2 -> released, State 4 -> refunded).
- **Service-to-Agent Alpha Flow**: Validates integration between Backend `/v1/signal` and `/v1/score` outputs and the Agent Scout/Analyst decision pipeline.
- **Frontend-to-Service Integration**: Validates communication between Frontend `SignalPanel`/`PoolIntel` components and Backend Express endpoints under CORS.
- **Mandate-to-Escrow Pipeline**: Validates compatibility between EIP-712 Mandate struct encoding and TaskEscrow contract deposit verification requirements.
- **Service-to-HCS Audit Trail**: Validates persistence pipeline from paid API response to `data/receipts.json` and Hedera Consensus Service audit payload.

### Tier 4: Real-World Application Scenarios (Playwright Headless Browser)
- **Headless Browser Execution**: Uses cached Chromium headless shell with arguments:
  `['--single-process', '--no-sandbox', '--disable-gpu']`
- **Zero Console Error Enforcement**: Attaches a strict listener to `page.on("console")` and `page.on("pageerror")`. Any `console.error`, unhandled rejection, or JavaScript runtime error fails the test run immediately.
- **Scenarios**:
  - `Scenario 1: Complete Route Navigation & UI Interactivity`: Navigates `/`, `/activity`, `/agents`, `/hire`, `/account`, `/human`, `/mandate`, `/proof`, `/privy`. Asserts DOM elements, Colosseum typography, diamond glyphs, and responsive navigation.
  - `Scenario 2: HireWizard 4-Step Interactive Journey`: Walks through agent selection, mandate definition, deposit configuration, and confirmation step.
  - `Scenario 3: Agent Market Discovery & Inspection`: Tests search, risk band filtering, and identity plate rendering.
  - `Scenario 4: Mandate Terms & EIP-712 Inspector`: Inspects typed structured data, verifies domain fields, and simulates mandate creation.
  - `Scenario 5: Proof & HashScan Receipt Verification`: Inspects cryptographic receipts, transaction IDs, and settlement logs.

---

## 3. Directory Layout

```
e2e/
├── fixtures/
│   ├── abi_fixtures.py            # TaskEscrow 14-field ABI, AegisRegistry, MockERC20
│   ├── eip712_fixtures.py         # Mandate typed data schemas and domain separator
│   └── mock_service.py            # Self-contained HTTP test server simulating service & web
├── tier1_features/
│   ├── test_f1_escrow_abi.py      # Feature 1: 14-field ABI sync tests (>=5 tests)
│   ├── test_f2_port_alignment.py  # Feature 2: Port 4021 alignment tests (>=5 tests)
│   ├── test_f4_cors_alignment.py  # Feature 4: CORS alignment tests (>=5 tests)
│   ├── test_f5_f6_frontend_infra.py # Features 5 & 6: Font & Tailwind tokens (>=5 tests)
│   ├── test_f7_f8_primitives_layout.py # Features 7 & 8: UI primitives & SiteShell (>=5 tests)
│   ├── test_f9_f10_routes_pages.py # Features 9 & 10: Routes & wizard tests (>=5 tests)
│   ├── test_f11_f12_web3_secondary.py # Features 11 & 12: Web3 & secondary pages (>=5 tests)
│   └── test_f16_security_secrets.py # Feature 16: Security & secrets tests (>=5 tests)
├── tier2_boundary/
│   ├── test_escrow_boundaries.py  # Escrow uint256 limits, time windows, zero address (>=5 tests)
│   ├── test_service_boundaries.py # Symbol schema limits, payload bounds, rate limits (>=5 tests)
│   ├── test_agent_boundaries.py   # ENS resolution, pool addresses, key validation (>=5 tests)
│   ├── test_mandate_boundaries.py # Timestamp bounds, chain ID mismatches, nonces (>=5 tests)
│   └── test_frontend_boundaries.py# Search boundaries, step indices, pagination (>=5 tests)
├── tier3_combinations/
│   ├── test_escrow_to_agent_flow.py # Escrow state tuple -> Freelancer worker settlement
│   ├── test_service_to_agent_flow.py # Backend signal/score -> Agent Scout/Analyst
│   ├── test_frontend_to_service_flow.py # Frontend SignalPanel -> Backend Express CORS
│   ├── test_mandate_to_escrow_flow.py # Mandate EIP-712 -> TaskEscrow validation
│   └── test_receipt_to_hcs_flow.py   # Paid handler -> receipts.json -> HCS audit
├── tier4_scenarios/
│   ├── test_browser_routes_and_console.py # Browser navigation, zero console errors across all routes
│   ├── test_browser_hire_wizard_journey.py # Interactive 4-step hire wizard journey
│   ├── test_browser_agent_catalog_journey.py # Agent discovery, filtering, and card interaction
│   ├── test_browser_mandate_inspector_journey.py # Mandate terms inspector & EIP-712 flow
│   └── test_browser_proof_and_receipts_journey.py # Receipts, audit log, and proof viewer
├── browser_harness.py             # Playwright browser manager with single-process args & error trapping
└── runner.py                      # Unified test runner supporting all tiers, reports, and exit codes
```

---

## 4. Execution Environment & Prerequisites
- **Python**: 3.10+ (`/Library/Frameworks/Python.framework/Versions/3.10/bin/python3` or standard `python3`)
- **Playwright**: 1.58+ (installed in Python environment)
- **Chromium Headless Shell**: Cached at `/Users/ramprasadgoud/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`
- **Headless Launch Arguments**: `['--single-process', '--no-sandbox', '--disable-gpu']`
- **Node.js**: v22.22.0 (`/Users/ramprasadgoud/.nvm/versions/node/v22.22.0/bin/node`)

---

## 5. How to Run the Tests

### One-Command Full Test Suite Execution
```bash
python3 e2e/runner.py
```
Or via shell script:
```bash
./run_e2e.sh
```

### Running Specific Tiers
```bash
# Run Tier 1 (Feature Coverage)
python3 e2e/runner.py --tier 1

# Run Tier 2 (Boundary & Corner Cases)
python3 e2e/runner.py --tier 2

# Run Tier 3 (Cross-Feature Combinations)
python3 e2e/runner.py --tier 3

# Run Tier 4 (Real-World Application Scenarios in Browser)
python3 e2e/runner.py --tier 4
```

### Command Options & Flags
- `--tier <1|2|3|4|all>`: Select which tier to execute (default: `all`).
- `-v, --verbose`: Display detailed test-by-test output and diagnostics.
- `--failfast`: Stop execution immediately on the first test failure.

---

## 6. Authoritative Expected Output Derivation
Every test in this suite derives its expected output directly from authoritative specifications:
1. **TaskEscrow ABI**: Derived from compiled Solidity artifact `contracts/out/TaskEscrow.sol/TaskEscrow.json` (14 outputs, `state` at index 13).
2. **Service Endpoints & Schemas**: Derived from `service/src/server.ts` and `pricing.ts` (`GET /health`, `GET /402-info`, `GET /v1/receipts`, `POST /v1/signal`, `POST /v1/score`).
3. **Colosseum Design Tokens**: Derived from `/Users/ramprasadgoud/Downloads/building/ETH-online-1026/grok-workspace` (`Newsreader`, `#1c1b18`, `#f3f2ee`, `#c01010`, `0px` radius, diamond glyphs `◆`).
4. **Interface Contracts**: Derived from `PROJECT.md § Interface Contracts` and user requirements in `ORIGINAL_REQUEST.md`.
