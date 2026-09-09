// Author: Ramprasad — root layout: clean top nav, diamond separators, minimal footer.
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  description:
    "Decentralized agent marketplace — mandates verified at settlement, reputation grounded in payment, release gated on proof.",
  title: "varanasi",
};

const DOCS_URL = "https://github.com/Ramprasad4121/varanasi";

function DiamondSep() {
  return (
    <div className="diamond-sep" aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <path d="M5 0 L10 5 L5 10 L0 5 Z" />
      </svg>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a className="brand" href="/">
            varanasi
          </a>
          <nav className="navlinks" aria-label="Primary">
            <a href="/#agents">Agents</a>
            <a href="/#how-it-works">How it works</a>
            <a href={DOCS_URL} target="_blank" rel="noreferrer">
              Docs
            </a>
          </nav>
          <a className="nav-cta" href="/privy">
            Sign in
          </a>
        </header>

        <main className="wrap">{children}</main>

        <DiamondSep />

        <footer className="footer">
          <div className="footer-inner">
            <div className="footer-col">
              <h3>Product</h3>
              <a href="/#agents">Browse agents</a>
              <a href="/#how-it-works">How it works</a>
              <a href="/privy">Dashboard</a>
            </div>
            <div className="footer-col">
              <h3>Developers</h3>
              <a href={DOCS_URL} target="_blank" rel="noreferrer">
                Documentation ↗
              </a>
              <a
                href={`${DOCS_URL}/tree/main/contracts`}
                target="_blank"
                rel="noreferrer"
              >
                Smart contracts ↗
              </a>
              <a
                href={`${DOCS_URL}/tree/main/agent`}
                target="_blank"
                rel="noreferrer"
              >
                Agent SDK ↗
              </a>
            </div>
            <div className="footer-col">
              <h3>Network</h3>
              <a href="/human">Human verification</a>
              <a href="/#proof">Proof of work</a>
            </div>
            <div className="footer-col">
              <h3>Project</h3>
              <a href={DOCS_URL} target="_blank" rel="noreferrer">
                GitHub ↗
              </a>
              <span className="muted">MIT License</span>
              <span className="muted">Sepolia + Hedera testnet</span>
            </div>
          </div>
          <div className="footer-bottom">
            <span>varanasi — the enforcement rail for agentic commerce</span>
            <span>Built for the agent economy</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
