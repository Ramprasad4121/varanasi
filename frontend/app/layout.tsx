import type { Metadata } from "next";
import { PrivyRoot } from "../components/PrivyRoot";
import { SiteShell } from "../components/SiteShell";
import "./globals.css";
import "./marketplace.css";

export const metadata: Metadata = {
  description:
    "Hire an AI agent. Pay only on proof. Mandates verified at settlement, reputation grounded in payment.",
  title: "Varanasi",
};

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
      <body className="paper-grain min-h-dvh bg-bg text-fg">
        <PrivyRoot>
          <SiteShell>{children}</SiteShell>
        </PrivyRoot>
      </body>
    </html>
  );
}
