// Author: Ramprasad — root layout: light top nav (Agents/Intel/Signals/Docs + Sign in → /privy) + globals.css + footer columns (Build/Proof/Project); no live deps; static only.
import type { Metadata } from "next";
import "./globals.css";
import {
  DEMO_RECEIPTS,
  REGISTRY,
  RISK_GUARD,
  UNISWAP_V3_SUBGRAPH,
  graphSubgraphUrl,
  hashscanTx,
  sepoliaAddress,
} from "../components/aegis";

export const metadata: Metadata = {
  description: "Human-authorized agent economy: ENSv2 identity, Graph intel, Hedera x402 payments.",
  title: "varanasi — Agent Dashboard",
};

const DOCS_URL = "https://github.com/Ramprasad4121/varanasi";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              <svg
                width="20"
                height="22"
                viewBox="0 0 12 14"
                fill="none"
                focusable="false"
              >
                <path
                  d="M6 0 C7.5 2.5 8.5 4.5 8.5 6.5 A2.5 2.5 0 0 1 3.5 6.5 C3.5 4.5 4.5 2.5 6 0 Z"
                  fill="#E8930C"
                />
                <path
                  d="M1 10 H11 C11 12.5 8.5 14 6 14 C3.5 14 1 12.5 1 10 Z"
                  fill="#7B1E1E"
                />
              </svg>
            </span>
            varanasi
          </a>
          <nav className="navlinks" aria-label="Primary">
            <a href="/#agents">Agents</a>
            <a href="/#intel">Intel</a>
            <a href="/#signals">Signals</a>
            <a href={DOCS_URL} target="_blank" rel="noreferrer">
              Docs
            </a>
          </nav>
          <a className="signin" href="/privy">
            Sign in
          </a>
        </header>
        <main className="wrap">{children}</main>
        <footer className="footer">
          <div className="footer-inner">
            <div className="footer-col">
              <h3>Build</h3>
              <a href={DOCS_URL} target="_blank" rel="noreferrer">
                Docs ↗
              </a>
              <a href={`${DOCS_URL}/tree/main/agent`} target="_blank" rel="noreferrer">
                Agent ↗
              </a>
              <a href={`${DOCS_URL}/tree/main/contracts`} target="_blank" rel="noreferrer">
                Contracts ↗
              </a>
              <a href="/human">Human check</a>
            </div>
            <div className="footer-col" id="proof">
              <h3>Proof</h3>
              <a href={sepoliaAddress(REGISTRY)} target="_blank" rel="noreferrer">
                Registry (Etherscan) ↗
              </a>
              <a href={sepoliaAddress(RISK_GUARD)} target="_blank" rel="noreferrer">
                RiskGuard (Etherscan) ↗
              </a>
              <a href={hashscanTx(DEMO_RECEIPTS[0])} target="_blank" rel="noreferrer">
                Receipt (HashScan) ↗
              </a>
              <a href={graphSubgraphUrl(UNISWAP_V3_SUBGRAPH)} target="_blank" rel="noreferrer">
                Subgraph ↗
              </a>
            </div>
            <div className="footer-col">
              <h3>Project</h3>
              <span className="muted">MIT</span>
              <span className="muted">ETHOnline 2026</span>
              <span className="muted">Sepolia + Hedera testnet</span>
            </div>
          </div>
          <div className="footer-note">
            <svg
              className="jaali-strip tight"
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <pattern
                  id="varanasi-jaali-footer"
                  width="28"
                  height="14"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M14 1 L27 7 L14 13 L1 7 Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                  />
                  <circle cx="14" cy="7" r="1.4" fill="currentColor" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#varanasi-jaali-footer)" />
            </svg>
          </div>
        </footer>
      </body>
    </html>
  );
}
