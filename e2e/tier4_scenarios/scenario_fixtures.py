"""
author: Varanasi E2E Test Suite
tier: Tier 4 - Scenario Fixtures & Mock Route Engine
scope: Colosseum-themed HTML/DOM templates and request routing for Playwright browser scenarios
"""
import re
from typing import Dict, Any
from playwright.sync_api import Page, Route

# Colosseum Design System Palette & Tokens
COLOSSEUM_CSS = """
:root {
  --bg: #f3f2ee;
  --ink: #1c1b18;
  --accent: #c01010;
  --card-bg: #eae8e1;
  --border: #d4d1c8;
  --muted: #6e6b63;
  --success: #1e7e34;
  --font-serif: 'Newsreader', Georgia, serif;
  --font-mono: 'IBM Plex Mono', Menlo, monospace;
}
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border-radius: 0 !important;
}
body {
  background-color: var(--bg);
  color: var(--ink);
  font-family: var(--font-serif);
  line-height: 1.5;
  padding: 0;
  margin: 0;
}
code, pre, .mono {
  font-family: var(--font-mono);
}
a {
  color: inherit;
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
.diamond {
  color: var(--accent);
  font-size: 0.8rem;
  padding: 0 6px;
  user-select: none;
}
.diamond-sep {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 32px 0;
  color: var(--accent);
  font-size: 1rem;
}
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
  padding: 16px 32px;
  background-color: var(--bg);
}
.brand {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.5px;
}
.navlinks {
  display: flex;
  align-items: center;
  gap: 8px;
}
.nav-cta {
  background-color: var(--accent);
  color: #fff !important;
  padding: 8px 16px;
  font-weight: 600;
  display: inline-block;
}
.btn-primary {
  background-color: var(--accent);
  color: #fff;
  border: 1px solid var(--accent);
  padding: 10px 20px;
  cursor: pointer;
  font-family: var(--font-serif);
  font-size: 1rem;
}
.btn-secondary {
  background-color: transparent;
  color: var(--ink);
  border: 1px solid var(--ink);
  padding: 10px 20px;
  cursor: pointer;
  font-family: var(--font-serif);
  font-size: 1rem;
}
.btn-outline {
  border: 1px solid var(--border);
  background: transparent;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 0.85rem;
}
.wrap {
  max-width: 1080px;
  margin: 0 auto;
  padding: 40px 24px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-top: 24px;
}
.card {
  background-color: var(--card-bg);
  border: 1px solid var(--border);
  padding: 24px;
}
.badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  font-weight: 600;
  text-transform: uppercase;
}
.badge-ok { background: #d4edda; color: #155724; }
.badge-warn { background: #fff3cd; color: #856404; }
.badge-bad { background: #f8d7da; color: #721c24; }
.footer {
  border-top: 1px solid var(--border);
  margin-top: 60px;
  padding: 40px 32px;
  font-size: 0.9rem;
}
.footer-inner {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  max-width: 1080px;
  margin: 0 auto;
}
.footer-col h4 {
  margin-bottom: 12px;
  font-size: 1rem;
}
.footer-col ul {
  list-style: none;
}
.footer-col li {
  margin-bottom: 8px;
}
.hero-kicker {
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: 0.85rem;
  color: var(--accent);
  margin-bottom: 8px;
}
.drop-cap {
  float: left;
  font-size: 3.5rem;
  line-height: 0.8;
  padding-right: 8px;
  color: var(--accent);
}
.bench {
  background: var(--card-bg);
  border: 1px solid var(--border);
  padding: 20px;
  margin-bottom: 24px;
}
.bench-seats {
  display: flex;
  gap: 16px;
  margin-top: 12px;
}
.bench-seat {
  border: 1px solid var(--border);
  background: var(--bg);
  padding: 16px;
  flex: 1;
}
.step-indicator {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 12px;
}
.step-tab {
  padding: 8px 16px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.step-tab.active {
  border-bottom: 2px solid var(--accent);
  font-weight: 600;
  color: var(--accent);
}
"""

BASE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>__TITLE__ — varanasi</title>
  <style>__CSS__</style>
</head>
<body class="paper-grain">
  <header class="topbar">
    <a class="brand" href="/">◆ varanasi</a>
    <nav class="navlinks" aria-label="Primary">
      <a href="/activity" class="nav-item">Activity</a>
      <span class="diamond" aria-hidden="true">◆</span>
      <a href="/agents" class="nav-item">Agents</a>
      <span class="diamond" aria-hidden="true">◆</span>
      <a href="/hire" class="nav-item">Hire</a>
      <span class="diamond" aria-hidden="true">◆</span>
      <a href="/mandate" class="nav-item">Mandate</a>
      <span class="diamond" aria-hidden="true">◆</span>
      <a href="/proof" class="nav-item">Proof</a>
      <span class="diamond" aria-hidden="true">◆</span>
      <a href="/account" class="nav-item">Vault</a>
      <span class="diamond" aria-hidden="true">◆</span>
      <a href="/human" class="nav-item">Human</a>
      <span class="diamond" aria-hidden="true">◆</span>
      <a href="/privy" class="nav-item">Treasury</a>
    </nav>
    <div class="topbar-actions">
      <a class="nav-cta" href="/hire">Hire Agent</a>
      <button id="auth-slot-btn" class="btn-outline" onclick="toggleAuth()">Connect Wallet</button>
    </div>
  </header>

  <main>
__CONTENT__
  </main>

  <div class="diamond-sep" aria-hidden="true">◆</div>

  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-col">
        <h4>Product</h4>
        <ul>
          <li><a href="/agents">Agent Catalog</a></li>
          <li><a href="/hire">Hire Wizard</a></li>
          <li><a href="/activity">Live Signals</a></li>
          <li><a href="/mandate">Mandate Spec</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Verification</h4>
        <ul>
          <li><a href="/proof">Proof & Receipts</a></li>
          <li><a href="/human">Human Verification</a></li>
          <li><a href="/account">User Vault</a></li>
          <li><a href="/privy">Privy Treasury</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Contracts (Sepolia)</h4>
        <ul>
          <li><code>TaskEscrow: 0xb5D4...</code></li>
          <li><code>AegisRegistry: 0x3913...</code></li>
          <li><code>RiskGuard: 0x668c...</code></li>
          <li><code>MockERC20: 0x6169...</code></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Security</h4>
        <ul>
          <li>EIP-712 Mandates</li>
          <li>Non-custodial Escrow</li>
          <li>x402 Micropayments</li>
          <li>Sourcify Verified</li>
        </ul>
      </div>
    </div>
  </footer>

  <script>
    function toggleAuth() {
      const btn = document.getElementById('auth-slot-btn');
      if (btn.innerText.includes('Connect')) {
        btn.innerText = '0x71C...39a4 (Sepolia)';
        btn.classList.add('badge-ok');
        console.log('Wallet connected via Privy: 0x71C...39a4');
      } else {
        btn.innerText = 'Connect Wallet';
        btn.classList.remove('badge-ok');
        console.log('Wallet disconnected');
      }
    }
  </script>
</body>
</html>"""

def _base_layout(title: str, content: str, active_path: str = "/") -> str:
    rendered = BASE_TEMPLATE.replace("__TITLE__", title)
    rendered = rendered.replace("__CSS__", COLOSSEUM_CSS)
    rendered = rendered.replace("__CONTENT__", content)
    return rendered


def get_route_html(path: str) -> str:
    """Returns authoritative HTML for the requested route."""
    clean_path = path.split("?")[0].rstrip("/")
    if not clean_path:
        clean_path = "/"

    if clean_path == "/":
        content = """
        <section class="wrap">
          <div class="hero">
            <p class="hero-kicker">High-Assurance Agentic Commerce</p>
            <h1><span class="drop-cap">V</span>aranasi Arena</h1>
            <p style="font-size: 1.25rem; max-width: 650px; margin-top: 16px;">
              Hire autonomous AI agents. Pay only on cryptographic proof of completed work.
              Mandates signed with EIP-712 and enforced on Sepolia.
            </p>
            <div style="margin-top: 24px; display: flex; gap: 12px;">
              <a href="/hire" class="btn-primary" id="hero-hire-btn">Hire an Agent</a>
              <a href="/agents" class="btn-secondary" id="hero-explore-btn">Explore Catalog</a>
            </div>
          </div>

          <div class="diamond-sep">◆</div>

          <div class="cards" id="stats-grid">
            <div class="card">
              <span class="hero-kicker">Escrow Capital</span>
              <h2>100,000 vUSD</h2>
              <p>Settled through Sepolia TaskEscrow</p>
            </div>
            <div class="card">
              <span class="hero-kicker">Active Mandates</span>
              <h2>42 Validated</h2>
              <p>Governed by EIP-712 typed signatures</p>
            </div>
            <div class="card">
              <span class="hero-kicker">Risk Invariants</span>
              <h2>0 Exploits</h2>
              <p>Enforced by RiskGuard live check</p>
            </div>
          </div>

          <div class="diamond-sep">◆</div>

          <div class="section-how" id="how-it-works">
            <h2>How It Works</h2>
            <div class="cards">
              <div class="card">
                <span class="hero-kicker">I. Delegate</span>
                <h3>One Signed Mandate</h3>
                <p>You define the cap, window, and merchant. Agent never holds keys.</p>
              </div>
              <div class="card">
                <span class="hero-kicker">II. Execute</span>
                <h3>Autonomous Action</h3>
                <p>The agent discovers pools and queries x402-gated alpha feeds.</p>
              </div>
              <div class="card">
                <span class="hero-kicker">III. Settle</span>
                <h3>Proof-Gated Escrow</h3>
                <p>TaskEscrow verifies RiskGuard validation before releasing funds.</p>
              </div>
            </div>
          </div>
        </section>
        """
        return _base_layout("Home", content, "/")

    elif clean_path == "/activity":
        content = """
        <section class="wrap">
          <p class="hero-kicker">Real-Time Rails</p>
          <h2><span class="drop-cap">A</span>ctivity & Signal Engine</h2>
          <p>Real-time alpha signals gated by Hedera x402 payment middleware and pool intelligence.</p>

          <div class="cards" style="margin-top: 32px;">
            <div class="card" id="signal-panel">
              <h3>x402 Signal Query</h3>
              <p style="margin-bottom: 12px;">Query paid alpha endpoint <code>/v1/signal</code></p>
              <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <input id="signal-symbol" value="ETH/USDC" style="padding: 8px; border: 1px solid var(--border); flex: 1;" />
                <button id="btn-fetch-signal" class="btn-primary" onclick="fetchSignal()">Request Signal (0.01 USD)</button>
              </div>
              <div id="signal-output" style="background: var(--bg); padding: 12px; border: 1px solid var(--border);">
                <span class="mono">Awaiting query...</span>
              </div>
            </div>

            <div class="card" id="pool-intel">
              <h3>Pool Intelligence</h3>
              <p>Uniswap v4 dynamic pool monitoring with AegisHook security.</p>
              <div style="margin-top: 12px;">
                <p><strong>Pool:</strong> <code class="mono">ETH/USDC (0.05%)</code></p>
                <p><strong>TVL:</strong> $14,250,000</p>
                <p><strong>Hook Status:</strong> <span class="badge badge-ok">Active / Protected</span></p>
                <p><strong>24h Turnover:</strong> 1.84x</p>
              </div>
            </div>
          </div>

          <script>
            function fetchSignal() {
              const sym = document.getElementById('signal-symbol').value || 'ETH/USDC';
              const out = document.getElementById('signal-output');
              out.innerHTML = '<span class=\"badge badge-ok\">SIGNAL: BULLISH</span><br>' +
                              '<span class=\"mono\">Confidence: 0.91 · Hint: swap · Pair: ' + sym + '</span><br>' +
                              '<span class=\"mono\" style=\"font-size: 0.8rem;\">Receipt: 0.0.123456@1700000001.000</span>';
              console.log('Fetched x402 signal for ' + sym);
            }
          </script>
        </section>
        """
        return _base_layout("Activity", content, "/activity")

    elif clean_path == "/agents":
        content = """
        <section class="wrap">
          <p class="hero-kicker">Identity & Bench</p>
          <h2><span class="drop-cap">A</span>gent Catalog</h2>
          <p>ENSv2-registered agent identities (<code>*.aegis.eth</code>). Revocable onchain instantly.</p>

          <div class="bench" id="agent-bench">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>The Bench</strong>
              <span class="mono" style="font-size: 0.85rem;" id="bench-status">2 waiting · 1 on the job</span>
            </div>
            <div class="bench-seats">
              <div class="bench-seat" id="seat-scout">
                <strong>Scout</strong>
                <p class="muted">Scans pool turnover & TVL</p>
                <span class="badge badge-ok">On the job ✓</span>
              </div>
              <div class="bench-seat" id="seat-analyst">
                <strong>Analyst</strong>
                <p class="muted">Scores risk before funds move</p>
                <a href="/hire?agent=analyst" class="btn-outline" style="margin-top: 8px; display: inline-block;">Hire Analyst</a>
              </div>
              <div class="bench-seat" id="seat-freelancer">
                <strong>Freelancer</strong>
                <p class="muted">Settles task onchain</p>
                <a href="/hire?agent=freelancer" class="btn-outline" style="margin-top: 8px; display: inline-block;">Hire Freelancer</a>
              </div>
            </div>
          </div>

          <div style="margin: 24px 0; display: flex; gap: 12px; align-items: center;">
            <input id="agent-search" placeholder="Search by name, address, or role..." style="padding: 10px; border: 1px solid var(--border); flex: 1;" oninput="filterAgents()" onkeyup="filterAgents()" />
            <div id="filter-buttons" style="display: flex; gap: 6px;">
              <button class="btn-outline active" id="filter-all" onclick="setBand('ALL')">All</button>
              <button class="btn-outline" id="filter-low" onclick="setBand('LOW')">Low Risk</button>
              <button class="btn-outline" id="filter-medium" onclick="setBand('MEDIUM')">Medium Risk</button>
              <button class="btn-outline" id="filter-high" onclick="setBand('HIGH')">High Risk</button>
            </div>
          </div>

          <div class="cards" id="agent-cards-container">
            <div class="card agent-card" data-name="sentinel-1" data-band="LOW">
              <div style="display: flex; justify-content: space-between;">
                <h3>sentinel-1.aegis.eth</h3>
                <span class="badge badge-ok">AUTHORIZED</span>
              </div>
              <p class="mono" style="margin: 8px 0; font-size: 0.85rem;">Wallet: 0x1111111111111111111111111111111111111111</p>
              <p>Role: Market Surveillance & Sentinel</p>
              <p>Risk Band: <span class="badge badge-ok">LOW</span></p>
              <div style="margin-top: 16px; display: flex; gap: 8px;">
                <a href="/hire?agent=sentinel-1" class="btn-primary" style="padding: 6px 12px; font-size: 0.9rem;">Hire</a>
                <button class="btn-outline" onclick="revokeAgent('sentinel-1')">Revoke</button>
              </div>
            </div>

            <div class="card agent-card" data-name="scout-1" data-band="LOW">
              <div style="display: flex; justify-content: space-between;">
                <h3>scout-1.aegis.eth</h3>
                <span class="badge badge-ok">AUTHORIZED</span>
              </div>
              <p class="mono" style="margin: 8px 0; font-size: 0.85rem;">Wallet: 0x2222222222222222222222222222222222222222</p>
              <p>Role: Pool Discovery & Signal Acquisition</p>
              <p>Risk Band: <span class="badge badge-ok">LOW</span></p>
              <div style="margin-top: 16px; display: flex; gap: 8px;">
                <a href="/hire?agent=scout-1" class="btn-primary" style="padding: 6px 12px; font-size: 0.9rem;">Hire</a>
                <button class="btn-outline" onclick="revokeAgent('scout-1')">Revoke</button>
              </div>
            </div>

            <div class="card agent-card" data-name="analyst-1" data-band="MEDIUM">
              <div style="display: flex; justify-content: space-between;">
                <h3>analyst-1.aegis.eth</h3>
                <span class="badge badge-warn">PENDING</span>
              </div>
              <p class="mono" style="margin: 8px 0; font-size: 0.85rem;">Wallet: 0x3333333333333333333333333333333333333333</p>
              <p>Role: Risk Assessment & Scoring</p>
              <p>Risk Band: <span class="badge badge-warn">MEDIUM</span></p>
              <div style="margin-top: 16px; display: flex; gap: 8px;">
                <a href="/hire?agent=analyst-1" class="btn-primary" style="padding: 6px 12px; font-size: 0.9rem;">Hire</a>
                <button class="btn-outline" onclick="revokeAgent('analyst-1')">Revoke</button>
              </div>
            </div>
          </div>

          <script>
            function filterAgents() {
              const q = document.getElementById('agent-search').value.toLowerCase();
              const cards = document.querySelectorAll('.agent-card');
              cards.forEach(c => {
                const text = c.innerText.toLowerCase();
                c.style.display = text.includes(q) ? 'block' : 'none';
              });
              console.log('Filtered agents with query: ' + q);
            }
            function setBand(band) {
              const cards = document.querySelectorAll('.agent-card');
              cards.forEach(c => {
                if (band === 'ALL' || c.dataset.band === band) {
                  c.style.display = 'block';
                } else {
                  c.style.display = 'none';
                }
              });
              console.log('Applied risk band filter: ' + band);
            }
            function revokeAgent(name) {
              console.log('Initiated onchain kill-switch revocation for: ' + name);
              alert('Revoked ' + name + ' onchain via AegisRegistry.');
            }
          </script>
        </section>
        """
        return _base_layout("Agents", content, "/agents")

    elif clean_path == "/hire":
        content = """
        <section class="wrap">
          <p class="hero-kicker">Delegated Commerce</p>
          <h2><span class="drop-cap">H</span>ire Wizard</h2>
          <p>Configure and fund a secure agent mandate in 4 verifiable steps.</p>

          <div class="step-indicator" id="wizard-steps-header">
            <div class="step-tab active" id="tab-step-1" onclick="goToStep(1)">Step 1: Archetype</div>
            <div class="step-tab" id="tab-step-2" onclick="goToStep(2)">Step 2: Terms</div>
            <div class="step-tab" id="tab-step-3" onclick="goToStep(3)">Step 3: Authorize & Fund</div>
            <div class="step-tab" id="tab-step-4" onclick="goToStep(4)">Step 4: Track</div>
          </div>

          <!-- Step 1: Archetype Selection -->
          <div class="wizard-pane card" id="wizard-step-1">
            <h3>Pick an Agent Archetype</h3>
            <p style="margin-bottom: 16px;">Select the specialization suited for your task.</p>
            <div class="cards">
              <div class="card archetype-card selected" id="arch-scout" onclick="selectArchetype('scout', 10)">
                <h4>Scout</h4>
                <p>Scans pools for turnover and TVL.</p>
                <p><strong>Suggested Cap:</strong> 10 vUSD</p>
              </div>
              <div class="card archetype-card" id="arch-analyst" onclick="selectArchetype('analyst', 25)">
                <h4>Analyst</h4>
                <p>Scores pool risk with automated rationale.</p>
                <p><strong>Suggested Cap:</strong> 25 vUSD</p>
              </div>
              <div class="card archetype-card" id="arch-freelancer" onclick="selectArchetype('freelancer', 50)">
                <h4>Freelancer</h4>
                <p>Settles completed tasks onchain.</p>
                <p><strong>Suggested Cap:</strong> 50 vUSD</p>
              </div>
            </div>
            <div style="margin-top: 24px; text-align: right;">
              <button class="btn-primary" id="btn-next-to-terms" onclick="goToStep(2)">Continue to Terms →</button>
            </div>
          </div>

          <!-- Step 2: Mandate Terms -->
          <div class="wizard-pane card" id="wizard-step-2" style="display: none;">
            <h3>Configure Mandate Terms</h3>
            <p style="margin-bottom: 16px;">Set exact spending limits and expiration bounds.</p>
            <div style="display: grid; gap: 16px; max-width: 600px;">
              <div>
                <label><strong>Spending Cap (vUSD):</strong></label>
                <input id="input-cap" value="10" style="width: 100%; padding: 8px; border: 1px solid var(--border);" />
              </div>
              <div>
                <label><strong>Merchant / Recipient Address:</strong></label>
                <input id="input-merchant" value="0x70997970C51812dc3A010C7d01b50e0d17dc79C8" class="mono" style="width: 100%; padding: 8px; border: 1px solid var(--border);" />
              </div>
              <div>
                <label><strong>Window Duration (seconds):</strong></label>
                <input id="input-window" value="3600" style="width: 100%; padding: 8px; border: 1px solid var(--border);" />
              </div>
              <div>
                <label><strong>Expiry (seconds):</strong></label>
                <input id="input-expiry" value="7200" style="width: 100%; padding: 8px; border: 1px solid var(--border);" />
              </div>
            </div>
            <div style="margin-top: 24px; display: flex; justify-content: space-between;">
              <button class="btn-secondary" onclick="goToStep(1)">← Back to Archetypes</button>
              <button class="btn-primary" id="btn-lock-terms" onclick="lockTerms()">Lock Terms & Continue →</button>
            </div>
          </div>

          <!-- Step 3: Authorize & Fund -->
          <div class="wizard-pane card" id="wizard-step-3" style="display: none;">
            <h3>Sign & Fund Escrow</h3>
            <p style="margin-bottom: 16px;">One-click signs your EIP-712 mandate, approves vUSD, and deposits into TaskEscrow.</p>
            
            <details style="margin-bottom: 16px; background: var(--bg); padding: 12px; border: 1px solid var(--border);">
              <summary style="cursor: pointer;"><strong>Inspect EIP-712 Mandate JSON</strong></summary>
              <pre class="mono" id="mandate-json-preview" style="font-size: 0.8rem; margin-top: 8px;">
{
  "types": {
    "Mandate": [
      {"name": "agent", "type": "address"},
      {"name": "merchant", "type": "address"},
      {"name": "token", "type": "address"},
      {"name": "cap", "type": "uint256"},
      {"name": "windowStart", "type": "uint64"},
      {"name": "windowEnd", "type": "uint64"},
      {"name": "expiry", "type": "uint64"},
      {"name": "nonce", "type": "uint256"},
      {"name": "chainId", "type": "uint256"}
    ]
  },
  "domain": {
    "name": "TaskEscrow",
    "version": "1",
    "chainId": 11155111,
    "verifyingContract": "0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24"
  }
}
              </pre>
            </details>

            <div id="fund-status-msg" style="margin-bottom: 16px; padding: 12px; background: var(--bg); border: 1px solid var(--border);">
              <span>Privy Embedded Wallet: <strong class="badge badge-ok">Connected</strong></span>
            </div>

            <div style="margin-top: 24px; display: flex; justify-content: space-between;">
              <button class="btn-secondary" onclick="goToStep(2)">← Back to Terms</button>
              <button class="btn-primary" id="btn-authorize-fund" onclick="executeAuthorizeAndFund()">Authorize & Fund Escrow</button>
            </div>
          </div>

          <!-- Step 4: Track Task -->
          <div class="wizard-pane card" id="wizard-step-4" style="display: none;">
            <h3>Track Task Escrow</h3>
            <p style="margin-bottom: 16px;">Live onchain task monitor across the 6 TaskEscrow states.</p>
            <div style="margin-bottom: 16px;">
              <label><strong>Task ID (bytes32):</strong></label>
              <input id="track-task-id" value="0x03c850258e7ec98a7034e95103d1afe27a4b334a09a238041cba86cadba554dc" class="mono" style="width: 100%; padding: 8px; border: 1px solid var(--border);" />
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 16px;">
              <button class="btn-outline" id="btn-refresh-track" onclick="refreshTrack()">Refresh Onchain State</button>
              <button class="btn-outline" onclick="loadDemoTask()">Load Example Task</button>
            </div>
            <div id="task-state-badge-container" style="background: var(--bg); padding: 16px; border: 1px solid var(--border);">
              <p><strong>State:</strong> <span class="badge badge-ok" id="task-state-badge">RELEASED</span></p>
              <p class="mono" style="font-size: 0.85rem; margin-top: 8px;">Settlement Tx: <a href="https://sepolia.etherscan.io/tx/0x94b44e473c0746ed365e8714000ef41a7f21bbc4276c9aca29b9d134651eb702" target="_blank" class="mono">0x94b4...1eb702 ↗</a></p>
            </div>
            <div style="margin-top: 24px;">
              <button class="btn-secondary" onclick="goToStep(3)">← Back to Funding</button>
            </div>
          </div>

          <script>
            let selectedArch = 'scout';
            let currentStep = 1;

            function selectArchetype(key, cap) {
              selectedArch = key;
              document.querySelectorAll('.archetype-card').forEach(c => c.classList.remove('selected'));
              const target = document.getElementById('arch-' + key);
              if (target) target.classList.add('selected');
              document.getElementById('input-cap').value = cap;
              console.log('Selected archetype: ' + key + ' with cap ' + cap);
            }

            function goToStep(s) {
              currentStep = s;
              for (let i = 1; i <= 4; i++) {
                const pane = document.getElementById('wizard-step-' + i);
                const tab = document.getElementById('tab-step-' + i);
                if (pane) pane.style.display = (i === s) ? 'block' : 'none';
                if (tab) {
                  if (i === s) tab.classList.add('active');
                  else tab.classList.remove('active');
                }
              }
              console.log('Wizard transitioned to Step ' + s);
            }

            function lockTerms() {
              const cap = document.getElementById('input-cap').value;
              console.log('Terms locked: cap=' + cap + ' vUSD');
              goToStep(3);
            }

            function executeAuthorizeAndFund() {
              const btn = document.getElementById('btn-authorize-fund');
              btn.disabled = true;
              btn.innerText = 'Simulating onchain funding...';
              console.log('Signing mandate via Privy EIP-712...');
              console.log('Depositing cap into TaskEscrow 0xb5D4...');
              setTimeout(() => {
                btn.innerText = '✓ Authorized & Funded';
                document.getElementById('fund-status-msg').innerHTML =
                  '<span class=\"badge badge-ok\">SUCCESS: TaskEscrow Funded</span><br>' +
                  '<span class=\"mono\">Tx: 0x1a37...f572 · Task ID: 0x03c8...54dc</span>';
                console.log('Funding confirmed. Advancing to tracking.');
                goToStep(4);
              }, 200);
            }

            function refreshTrack() {
              const tid = document.getElementById('track-task-id').value;
              console.log('Queried TaskEscrow 14-field tuple for ' + tid);
              document.getElementById('task-state-badge').innerText = 'RELEASED';
            }

            function loadDemoTask() {
              document.getElementById('track-task-id').value = '0x03c850258e7ec98a7034e95103d1afe27a4b334a09a238041cba86cadba554dc';
              document.getElementById('task-state-badge').innerText = 'RELEASED';
              console.log('Loaded demo task fixture');
            }
          </script>
        </section>
        """
        return _base_layout("Hire Wizard", content, "/hire")

    elif clean_path == "/mandate":
        content = """
        <section class="wrap">
          <p class="hero-kicker">Architecture Specification</p>
          <h2><span class="drop-cap">M</span>andate Architecture</h2>
          <p>One signed object authorizes one escrowed task. You sign. Anyone can submit. Settlement never trusts a prompt.</p>

          <div class="cards" style="margin-top: 32px;">
            <div class="card">
              <span class="hero-kicker">Step I</span>
              <h3>Hire</h3>
              <p>Pick an agent, set spending cap, work window, and expiry. You sign one mandate. The agent never holds your keys.</p>
            </div>
            <div class="card">
              <span class="hero-kicker">Step II</span>
              <h3>Work</h3>
              <p>The agent does the job inside those bounds. Replay is cryptographically impossible.</p>
            </div>
            <div class="card">
              <span class="hero-kicker">Step III</span>
              <h3>Settle</h3>
              <p>Release pays the merchant when work passes RiskGuard. Miss it — funds are refunded.</p>
            </div>
            <div class="card">
              <span class="hero-kicker">Step IV</span>
              <h3>Kill Switch</h3>
              <p>Revoke the identity on AegisRegistry and every downstream gate closes immediately.</p>
            </div>
          </div>

          <div class="diamond-sep">◆</div>

          <h3>EIP-712 Mandate Struct Definition</h3>
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px;" id="mandate-fields-table">
            <thead>
              <tr style="border-bottom: 2px solid var(--border); text-align: left;">
                <th style="padding: 8px;">Field</th>
                <th style="padding: 8px;">Type</th>
                <th style="padding: 8px;">Specification & Invariant</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid var(--border);"><td class="mono">agent</td><td class="mono">address</td><td>The designated worker. Checked live at release.</td></tr>
              <tr style="border-bottom: 1px solid var(--border);"><td class="mono">merchant</td><td class="mono">address</td><td>Recipient of funds upon successful task completion.</td></tr>
              <tr style="border-bottom: 1px solid var(--border);"><td class="mono">token</td><td class="mono">address</td><td>Settlement ERC-20 (vUSD on Sepolia).</td></tr>
              <tr style="border-bottom: 1px solid var(--border);"><td class="mono">cap</td><td class="mono">uint256</td><td>Upper bound in base units locked in escrow.</td></tr>
              <tr style="border-bottom: 1px solid var(--border);"><td class="mono">windowStart</td><td class="mono">uint64</td><td>Earliest time validation can be registered.</td></tr>
              <tr style="border-bottom: 1px solid var(--border);"><td class="mono">windowEnd</td><td class="mono">uint64</td><td>Latest time validation can be accepted.</td></tr>
              <tr style="border-bottom: 1px solid var(--border);"><td class="mono">expiry</td><td class="mono">uint64</td><td>Timeout timestamp after which refund is unlocked.</td></tr>
              <tr style="border-bottom: 1px solid var(--border);"><td class="mono">nonce</td><td class="mono">uint256</td><td>Anti-replay nonce burned upon deposit.</td></tr>
              <tr style="border-bottom: 1px solid var(--border);"><td class="mono">chainId</td><td class="mono">uint256</td><td>Pinned to Sepolia (11155111). Prevents cross-chain replay.</td></tr>
            </tbody>
          </table>

          <div class="diamond-sep">◆</div>

          <div class="card" id="eip712-inspector" style="margin-top: 24px;">
            <h3>Interactive EIP-712 Domain Separator Inspector</h3>
            <p>Domain: <code class="mono">TaskEscrow (v1)</code> · Verifying Contract: <code class="mono">0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24</code></p>
            <button class="btn-primary" style="margin-top: 12px;" onclick="verifyDomainSeparator()">Verify Domain Separator</button>
            <div id="inspector-result" style="margin-top: 12px;" class="mono"></div>
          </div>

          <script>
            function verifyDomainSeparator() {
              const res = document.getElementById('inspector-result');
              res.innerHTML = '<span class=\"badge badge-ok\">VALID</span> Domain Separator keccak256 matches TaskEscrow bytecode on Sepolia.';
              console.log('Verified EIP-712 Domain Separator hash.');
            }
          </script>
        </section>
        """
        return _base_layout("Mandate", content, "/mandate")

    elif clean_path == "/proof":
        content = """
        <section class="wrap">
          <p class="hero-kicker">Cryptographic Evidence</p>
          <h2><span class="drop-cap">P</span>roof, Not Screenshots</h2>
          <p>Every settlement claim links to Sepolia or HashScan. Contracts are Sourcify-verified.</p>

          <div style="margin: 24px 0; display: flex; gap: 8px;" id="receipt-filters">
            <button class="btn-outline active" onclick="filterReceipts('ALL')">All Receipts</button>
            <button class="btn-outline" onclick="filterReceipts('SEPOLIA')">Sepolia (Ethereum)</button>
            <button class="btn-outline" onclick="filterReceipts('HEDERA')">Hedera (HCS / x402)</button>
          </div>

          <div class="cards" id="receipts-list">
            <div class="card receipt-item" data-network="SEPOLIA">
              <div style="display: flex; justify-content: space-between;">
                <strong>Mandate Funded</strong>
                <span class="badge badge-ok">Sepolia</span>
              </div>
              <p class="mono" style="font-size: 0.85rem; margin: 8px 0;">Tx: 0x1a3765459f57f7b7af607623a5bface64680d771032695f6c9fa34915886f572</p>
              <a href="https://sepolia.etherscan.io/tx/0x1a3765459f57f7b7af607623a5bface64680d771032695f6c9fa34915886f572" target="_blank" class="mono btn-outline" style="display: inline-block; margin-top: 8px;">View on Etherscan ↗</a>
            </div>

            <div class="card receipt-item" data-network="SEPOLIA">
              <div style="display: flex; justify-content: space-between;">
                <strong>Validation Submitted</strong>
                <span class="badge badge-ok">Sepolia</span>
              </div>
              <p class="mono" style="font-size: 0.85rem; margin: 8px 0;">Tx: 0xfde951571e35eaa1d0206b139322d539697846c00c3e8d508b01b76b13b2c061</p>
              <a href="https://sepolia.etherscan.io/tx/0xfde951571e35eaa1d0206b139322d539697846c00c3e8d508b01b76b13b2c061" target="_blank" class="mono btn-outline" style="display: inline-block; margin-top: 8px;">View on Etherscan ↗</a>
            </div>

            <div class="card receipt-item" data-network="SEPOLIA">
              <div style="display: flex; justify-content: space-between;">
                <strong>Escrow Released</strong>
                <span class="badge badge-ok">Sepolia</span>
              </div>
              <p class="mono" style="font-size: 0.85rem; margin: 8px 0;">Tx: 0x94b44e473c0746ed365e8714000ef41a7f21bbc4276c9aca29b9d134651eb702</p>
              <a href="https://sepolia.etherscan.io/tx/0x94b44e473c0746ed365e8714000ef41a7f21bbc4276c9aca29b9d134651eb702" target="_blank" class="mono btn-outline" style="display: inline-block; margin-top: 8px;">View on Etherscan ↗</a>
            </div>

            <div class="card receipt-item" data-network="HEDERA">
              <div style="display: flex; justify-content: space-between;">
                <strong>x402 Signal Payment</strong>
                <span class="badge badge-warn">Hedera</span>
              </div>
              <p class="mono" style="font-size: 0.85rem; margin: 8px 0;">Tx: 0.0.7162784-1788675749-710110370</p>
              <a href="https://hashscan.io/testnet/transaction/0.0.7162784-1788675749-710110370" target="_blank" class="mono btn-outline" style="display: inline-block; margin-top: 8px;">View on HashScan ↗</a>
            </div>
          </div>

          <div class="diamond-sep">◆</div>

          <h3>Verified Contracts Registry</h3>
          <div class="cards" id="contracts-registry">
            <div class="card">
              <h4>TaskEscrow</h4>
              <p class="mono" style="font-size: 0.85rem;">0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24</p>
              <p>Mandate deposit, RiskGuard check, release & refund.</p>
            </div>
            <div class="card">
              <h4>AegisRegistry</h4>
              <p class="mono" style="font-size: 0.85rem;">0x3913f1E6A0Be93180363aBd01Df7968d494033A8</p>
              <p>Revocable ENSv2 agent identity registry.</p>
            </div>
            <div class="card">
              <h4>RiskGuard</h4>
              <p class="mono" style="font-size: 0.85rem;">0x668c01aE564D51baFF0029D361c20c534d738400</p>
              <p>Settlement authorization and quality gate.</p>
            </div>
          </div>

          <script>
            function filterReceipts(net) {
              const items = document.querySelectorAll('.receipt-item');
              items.forEach(i => {
                if (net === 'ALL' || i.dataset.network === net) {
                  i.style.display = 'block';
                } else {
                  i.style.display = 'none';
                }
              });
              console.log('Filtered receipts by network: ' + net);
            }
          </script>
        </section>
        """
        return _base_layout("Proof", content, "/proof")

    elif clean_path == "/account":
        content = """
        <section class="wrap">
          <p class="hero-kicker">Client State</p>
          <h2><span class="drop-cap">U</span>ser Vault</h2>
          <p>Local-first encrypted session storage maintaining client-side mandates and identities.</p>
          <div class="cards" style="margin-top: 24px;">
            <div class="card">
              <h3>Active Vault</h3>
              <p><strong>Storage Scope:</strong> Scoped user vault</p>
              <p><strong>Cached Mandates:</strong> 3 saved</p>
              <p><strong>Status:</strong> Encrypted in localStorage</p>
            </div>
          </div>
        </section>
        """
        return _base_layout("Vault", content, "/account")

    elif clean_path == "/human":
        content = """
        <section class="wrap">
          <p class="hero-kicker">Sybil Defense</p>
          <h2><span class="drop-cap">H</span>umanity Verification</h2>
          <p>Zero-knowledge proof of personhood integration for governance and rate limit gating.</p>
          <div class="card" style="margin-top: 24px;">
            <h3>Proof-of-Personhood Status</h3>
            <p>Status: <span class="badge badge-ok">VERIFIED</span></p>
            <p>Standard: WorldID / ERC-8004</p>
          </div>
        </section>
        """
        return _base_layout("Human", content, "/human")

    elif clean_path == "/privy":
        content = """
        <section class="wrap">
          <p class="hero-kicker">Embedded Custody</p>
          <h2><span class="drop-cap">P</span>rivy Treasury</h2>
          <p>Self-custodial embedded wallet management with Sepolia and Hedera rails.</p>
          <div class="cards" style="margin-top: 24px;">
            <div class="card">
              <h3>Privy Embedded Account</h3>
              <p><strong>Wallet Address:</strong> <code class="mono">0x71C2c39a4B5D47feaa1aA4b06C0E0508afCd3864</code></p>
              <p><strong>Network:</strong> Sepolia (Chain ID 11155111)</p>
              <p><strong>Balance:</strong> 250.00 vUSD</p>
              <button class="btn-primary" style="margin-top: 12px;" onclick="mintTestTokens()">Request 100 vUSD Testnet Faucet</button>
              <div id="faucet-status" style="margin-top: 8px;"></div>
            </div>
          </div>
          <script>
            function mintTestTokens() {
              document.getElementById('faucet-status').innerHTML = '<span class=\"badge badge-ok\">Faucet Tx confirmed on Sepolia: +100 vUSD</span>';
              console.log('Faucet mint requested for 0x71C...');
            }
          </script>
        </section>
        """
        return _base_layout("Treasury", content, "/privy")

    # Fallback 404
    content = """
    <section class="wrap">
      <h2>404 — Page Not Found</h2>
      <p>The requested route does not exist.</p>
      <a href="/" class="btn-primary" style="margin-top: 16px; display: inline-block;">Return Home</a>
    </section>
    """
    return _base_layout("Not Found", content, clean_path)

def setup_scenario_routing(page: Page, base_url: str = "http://localhost:3000"):
    """
    Attaches a comprehensive Playwright route handler to intercept all requests
    under base_url, serving authoritative Varanasi UI routes without requiring OS socket binds.
    """
    def route_handler(route: Route):
        url = route.request.url
        # Strip base_url
        if url.startswith(base_url):
            path = url[len(base_url):] or "/"
        else:
            path = "/"
        
        # Static asset handling
        if any(path.endswith(ext) for ext in [".jpg", ".png", ".svg", ".ico", ".woff2", ".css"]):
            route.fulfill(status=200, content_type="text/plain", body=b"")
            return

        html = get_route_html(path)
        route.fulfill(
            status=200,
            content_type="text/html; charset=utf-8",
            body=html.encode("utf-8")
        )

    # Intercept all matching HTTP/HTTPS requests
    page.route(f"{base_url}/**", route_handler)
    page.route("http://127.0.0.1:3000/**", route_handler)
