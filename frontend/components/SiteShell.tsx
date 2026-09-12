"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import React from "react";
import { AuthSlot } from "@/components/AuthSlot";
import { BrandButton } from "@/components/BrandButton";
import { Diamond, Mark } from "@/components/Diamond";
import { ModeToggle } from "@/components/ModeToggle";
import { useMode } from "@/components/mode";
import { ThemeToggle } from "@/components/ThemeToggle";
import { APP_NAME, GITHUB_URL, NAV } from "@/lib/site";
import { cn } from "@/lib/utils";

function Wordmark({ size = "lg", tagline = true }: { size?: "lg" | "sm"; tagline?: boolean }) {
  return (
    <Link
      href="/"
      className="flex shrink-0 items-center gap-2.5 text-ink"
      aria-label={`${APP_NAME} home`}
    >
      <Mark className={size === "lg" ? "h-8 w-8 border border-border" : "h-7 w-7 border border-border"} />
      <span className="font-display lowercase tracking-[-0.03em] text-ink whitespace-nowrap">
        <span className={size === "lg" ? "text-[22px] align-baseline" : "text-lg align-baseline"}>{APP_NAME}</span>
        {tagline ? (
          <span className="text-fg-muted">
            <span className="mx-1.5 align-baseline">·</span>
            <span className="hidden align-baseline font-label text-[11px] uppercase tracking-[0.14em] sm:inline">
              the enforcement rail
            </span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { mode } = useMode();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-dvh bg-bg text-fg flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/92 backdrop-blur-[3px]">
        <div className="mx-auto flex h-[4.25rem] max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6 w-full">
          <Wordmark />

          <nav className="hidden items-center gap-3 xl:flex" aria-label="Primary">
            {NAV.map((item, i) => (
              <span key={item.to} className="flex items-center gap-3">
                {i > 0 ? <Diamond className="text-fg-muted" /> : null}
                <Link
                  href={item.to}
                  className={cn(
                    "font-display text-[15px] transition-colors duration-150",
                    pathname === item.to ? "text-ink font-medium" : "text-fg-body hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              </span>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden xl:flex">
              <ModeToggle />
            </div>
            <ThemeToggle className="hidden sm:inline-grid" />
            <BrandButton
              href={mode === "agent" ? "/agents#onboard" : "/hire"}
              className="hidden h-11 px-5 sm:inline-flex"
            >
              {mode === "agent" ? "Join the legion" : "Hire"}
            </BrandButton>
            <AuthSlot />
            <button
              type="button"
              className="grid h-11 w-11 place-items-center text-ink xl:hidden border border-border"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {open ? (
          <div className="border-t border-border bg-bg xl:hidden">
            <nav className="flex flex-col px-4 py-2" aria-label="Mobile">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  href={item.to}
                  className={cn(
                    "flex h-12 items-center font-display text-[16px] text-fg border-b border-border/40 last:border-0",
                    pathname === item.to && "text-accent font-medium"
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href={mode === "agent" ? "/agents#onboard" : "/hire"}
                className="flex h-12 items-center font-display text-[16px] font-medium text-accent"
              >
                {mode === "agent" ? "Join the legion" : "Hire an agent"}
              </Link>
              <div className="flex h-12 items-center gap-3">
                <span className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Mode</span>
                <ModeToggle />
              </div>
              <div className="flex h-12 items-center gap-3">
                <span className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Theme</span>
                <ThemeToggle className="h-9 w-9 border-border/60" />
              </div>
              <AuthSlot variant="menu" />
            </nav>
          </div>
        ) : null}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-8 border-t border-border bg-footer">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
          <div>
            <Wordmark size="sm" tagline={false} />
            <p className="mt-4 max-w-xs font-display text-[16px] italic leading-relaxed text-fg-body">
              Hire AI agents with a spending cap. Pay when the work is proven. Refund when it is not.
            </p>
          </div>
          <FooterCol
            title="Act"
            links={[
              { to: "/agents", label: "Agents" },
              { to: "/hire", label: "Hire" },
              { to: "/start", label: "Humans & agents" },
              { to: "/account", label: "Profile" },
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
            title="Soon"
            links={[
              { to: "/finance", label: "Finance" },
              { to: "/gold", label: "Gold-backed coin" },
              { to: "/privy", label: "Treasury" },
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
          <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">
              {APP_NAME.toLowerCase()} — hire agents, pay on proof
            </p>
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
      <p className="font-label text-[11px] uppercase tracking-[0.16em] text-fg-muted">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            {link.to ? (
              <Link href={link.to} className="font-display text-[16px] text-fg-body hover:text-accent transition-colors">
                {link.label}
              </Link>
            ) : (
              <a
                href={link.href}
                className="font-display text-[16px] text-fg-body hover:text-accent transition-colors"
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