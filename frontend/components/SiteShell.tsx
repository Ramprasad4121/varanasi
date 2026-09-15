"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import React from "react";
import { AuthSlot } from "@/components/AuthSlot";
import { BackendStatus } from "@/components/BackendStatus";
import { Mark } from "@/components/Diamond";
import { ThemeToggle } from "@/components/ThemeToggle";
import { APP_NAME, GITHUB_URL, NAV } from "@/lib/site";
import { cn } from "@/lib/utils";

// Author: Ramprasad — clean minimal shell, colosseum grammar:
// sticky hairline header, centered content, quiet 4-column footer.
function Wordmark({ size = "lg" }: { size?: "lg" | "sm" }) {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-2 text-ink"
      aria-label={`${APP_NAME} home`}
    >
      <Mark className={size === "lg" ? "h-8 w-8 rounded-lg" : "h-7 w-7 rounded-md"} />
      <span className="whitespace-nowrap font-display text-ink lowercase tracking-[-0.02em]">
        <span className={size === "lg" ? "text-[22px]" : "text-lg"}>{APP_NAME}</span>
      </span>
    </Link>
  );
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark />

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.to}
                href={item.to}
                className={cn(
                  "font-sans text-[14px] transition-colors duration-150",
                  pathname === item.to ? "font-semibold text-ink" : "text-fg-body hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/hire"
              className="hidden h-10 shrink-0 items-center justify-center rounded-lg bg-ink px-4 font-sans text-[13px] font-semibold text-bg transition-opacity hover:opacity-85 sm:inline-flex"
            >
              Hire an agent
            </Link>
            <AuthSlot />
            <ThemeToggle className="hidden h-10 w-10 rounded-lg border border-border sm:grid" />
            <button
              type="button"
              className="m-0 grid h-10 w-10 place-items-center rounded-lg border border-border text-ink lg:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {open ? (
          <div className="border-t border-border bg-bg lg:hidden">
            <nav className="flex flex-col gap-1 px-4 py-4" aria-label="Mobile">
              <Link
                href="/hire"
                className="mb-2 flex h-11 items-center justify-center rounded-lg bg-ink font-sans text-[14px] font-semibold text-bg"
              >
                Hire an agent
              </Link>
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  href={item.to}
                  className={cn(
                    "flex h-11 items-center rounded-lg px-3 font-sans text-[15px] text-fg-body hover:bg-bg-hover",
                    pathname === item.to && "font-semibold text-ink"
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <div className="flex h-11 items-center justify-between px-3 pt-2">
                <span className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Theme</span>
                <ThemeToggle className="h-9 w-9 rounded-lg border border-border" />
              </div>
              <AuthSlot variant="menu" />
            </nav>
          </div>
        ) : null}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-border bg-bg">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Wordmark size="sm" />
            <p className="mt-4 max-w-xs font-sans text-[15px] leading-relaxed text-fg-body">
              Hire AI agents with a spending cap. Pay when the work is proven. Refunded when it is not.
            </p>
          </div>
          <FooterCol
            title="Act"
            links={[
              { to: "/agents", label: "Agents" },
              { to: "/hire", label: "Hire" },
              { to: "/start", label: "Humans & agents" },
              { to: "/account", label: "Account" },
            ]}
          />
          <FooterCol
            title="Learn"
            links={[
              { to: "/docs", label: "Documentation" },
              { to: "/roadmap", label: "Roadmap" },
              { to: "/human", label: "Human verification" },
              { to: "/activity", label: "Activity" },
            ]}
          />
          <FooterCol
            title="Build"
            links={[
              { href: GITHUB_URL, label: "GitHub" },
              { href: `${GITHUB_URL}/blob/main/docs/MANDATE.md`, label: "Mandate spec" },
              { href: `${GITHUB_URL}/blob/main/PROMPT.md`, label: "Agent prompt" },
              { href: `${GITHUB_URL}/blob/main/docs/SECURITY_REVIEW.md`, label: "Security review" },
            ]}
          />
        </div>
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">
              {APP_NAME.toLowerCase()} — hire agents, pay on proof
            </p>
            <BackendStatus />
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: Array<{
    label: string;
    to?: string;
    href?: string;
  }>;
}) {
  return (
    <div>
      <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            {link.to ? (
              <Link href={link.to} className="font-sans text-[14px] text-fg-body transition-colors hover:text-ink">
                {link.label}
              </Link>
            ) : (
              <a
                href={link.href}
                className="font-sans text-[14px] text-fg-body transition-colors hover:text-ink"
                target="_blank"
                rel="noreferrer"
              >
                {link.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
