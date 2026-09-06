import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  description: "Human-authorized agent economy: ENSv2 identity, Graph intel, Hedera x402 payments.",
  title: "AEGIS — Agent Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <strong>AEGIS</strong>
          <span className="muted">Human-Authorized Agent Economy · ETHOnline 2026 · Sepolia</span>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
