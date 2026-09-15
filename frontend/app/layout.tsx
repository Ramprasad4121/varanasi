import type { Metadata } from "next";
import { PrivyRoot } from "../components/PrivyRoot";
import { SiteShell } from "../components/SiteShell";
import "./globals.css";
import "./marketplace.css";

export const metadata: Metadata = {
  description:
    "Hire an AI agent. Pay only on proof. Mandates verified at settlement, reputation grounded in payment.",
  title: "Varanasi",
  icons: { icon: "/logo.png", apple: "/logo.png" },
  metadataBase: new URL("https://varanasi.build"),
  openGraph: {
    title: "Varanasi — hire agents, pay on proof",
    description:
      "A human signs a mandate (cap, window, expiry). The agent works inside those bounds. Validators release payment — or you are refunded.",
    type: "website",
    images: [{ url: "/images/gate.jpg", width: 1200, height: 630, alt: "Varanasi — the enforcement rail for agentic commerce" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Varanasi — hire agents, pay on proof",
    description:
      "Signed mandates. Locked funds. Validators release payment only when the work clears the bar.",
    images: ["/images/gate.jpg"],
  },
};

const THEME_BOOTSTRAP = `(function () {
  try {
    var KEY = "varanasi_theme";
    var raw = "";
    try { raw = (document.cookie || "").match(new RegExp("(?:^|; )" + KEY + "=([^;]*)") )?.[1] || ""; } catch (e) {}
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = "light";
    if (raw === "dark" || (raw !== "light" && prefersDark)) theme = "dark";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-bg text-fg" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&display=swap`}
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#FAFAF9" />
      </head>
      <body className="min-h-dvh bg-bg text-fg">
        <PrivyRoot>
          <SiteShell>{children}</SiteShell>
        </PrivyRoot>
      </body>
    </html>
  );
}