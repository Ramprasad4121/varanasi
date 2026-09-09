// Author: Ramprasad — Colosseum paper chrome: drop-cap wordmark, diamond nav, roman red hire CTA, site-wide sign-in.
import type { Metadata } from "next";
import { AuthSlot } from "../components/AuthSlot";
import { PrivyRoot } from "../components/PrivyRoot";
import "./globals.css";

export const metadata: Metadata = {
  description:
    "Hire an AI agent. Pay only on proof. Mandates verified at settlement, reputation grounded in payment.",
  title: "varanasi",
};

const DOCS_URL = "https://github.com/Ramprasad4121/varanasi";

function DiamondSep() {
  return (
    <div className="diamond-sep" aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
        <path d="M5 0.7 L9.3 5 L5 9.3 L0.7 5 Z" />
      </svg>
    </div>
  );
}

function Diamond() {
  return (
    <svg className="nav-diamond" viewBox="0 0 9 9" width="9" height="9" aria-hidden="true">
      <path fill="none" stroke="currentColor" d="M8.293 4.5 4.5 8.293.707 4.5 4.5.707z" />
    </svg>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,500&family=UnifrakturMaguntia&display=swap"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="paper-grain">
        <PrivyRoot>
          <header className="topbar">
            <a className="brand" href="/">
              <img src="/images/emblem.jpg" alt="" />
              varanasi
            </a>
            <nav className="navlinks" aria-label="Primary">
              <a href="/#agents">Agents</a>
              <Diamond />
              <a href="/#how-it-works">How it works</a>
              <Diamond />
              <a href="/proof">Proof</a>
              <Diamond />
              <a href="/mandate">Mandate</a>
              <Diamond />
              <a href="/about">About</a>
              <Diamond />
              <a href="/account">Vault</a>
            </nav>
            <div className="topbar-actions">
              <a className="nav-cta" href="/#hire-wizard">
                Hire
              </a>
              <AuthSlot />
            </div>
          </header>

          <main>{children}</main>

          <DiamondSep />

          <footer className="footer">
            <div className="footer-inner">
              <div className="footer-col">
                <h3>Product</h3>
                <a href="/#agents">Browse agents</a>
                <a href="/#how-it-works">How it works</a>
                <a href="/mandate">The mandate</a>
                <a href="/proof">Proof</a>
                <a href="/about">About</a>
                <a href="/account">Your vault</a>
                <a href="/privy">Treasury</a>
              </div>
              <div className="footer-col">
                <h3>Developers</h3>
                <a href={DOCS_URL} target="_blank" rel="noreferrer">
                  Documentation ↗
                </a>
                <a href={`${DOCS_URL}/tree/main/contracts`} target="_blank" rel="noreferrer">
                  Smart contracts ↗
                </a>
                <a href={`${DOCS_URL}/tree/main/agent`} target="_blank" rel="noreferrer">
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
              <span>MIT · Ramprasad · Sepolia + Hedera</span>
            </div>
          </footer>
        </PrivyRoot>
      </body>
    </html>
  );
}
