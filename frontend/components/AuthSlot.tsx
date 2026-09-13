"use client";

import Link from "next/link";
import React from "react";
import { usePrivy } from "@privy-io/react-auth";

const HAS_PRIVY = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export function AuthSlot({ variant = "nav" }: { variant?: "nav" | "menu" }) {
  if (!HAS_PRIVY) {
    if (variant === "menu") {
      return (
        <Link href="/account" className="flex h-12 items-center font-display text-[16px] font-medium text-accent">
          Account
        </Link>
      );
    }
    return (
      <Link
        href="/account"
        className="inline-flex h-9 items-center border border-ink/80 px-3.5 m-0 font-label text-[11px] uppercase tracking-[0.14em] text-ink hover:bg-ink hover:text-bg transition-colors"
      >
        Sign in
      </Link>
    );
  }
  return <AuthSlotInner variant={variant} />;
}

function AuthSlotInner({ variant }: { variant: "nav" | "menu" }) {
  const { ready, authenticated, login, logout, user } = usePrivy();

  const address = user?.wallet?.address;
  const email = user?.email?.address;
  const google = user?.google?.email;
  const github = user?.github?.username;
  const raw = address ?? email ?? google ?? github ?? "Account";
  const display = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : email
      ? email.split("@")[0]
      : google
        ? google.split("@")[0]
        : github ?? "Account";

  if (!ready) {
    if (variant === "menu") {
      return (
        <button
          type="button"
          disabled
          className="flex h-11 items-center font-display text-[15px] text-fg-muted text-left m-0"
        >
          Sign in
        </button>
      );
    }
    return (
      <div className="h-9 w-20 animate-pulse border border-border bg-bg-muted" />
    );
  }

  if (!authenticated) {
    if (variant === "menu") {
      return (
        <button
          type="button"
          onClick={() => login()}
          className="flex h-11 items-center font-display text-[15px] font-medium text-accent text-left m-0"
        >
          Sign in
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => login()}
        className="inline-flex h-9 items-center border border-ink/80 px-3.5 m-0 font-label text-[11px] uppercase tracking-[0.14em] text-ink hover:bg-ink hover:text-bg transition-colors"
      >
        Sign in
      </button>
    );
  }

  if (variant === "menu") {
    return (
      <div className="flex flex-col gap-1 py-2 border-t border-border/40">
        <Link href="/account" className="flex h-11 items-center justify-between font-display text-[15px] font-medium text-ink">
          <span>Account</span>
          <span className="font-mono text-xs text-accent">{display}</span>
        </Link>
        <button
          type="button"
          onClick={() => logout()}
          className="flex h-8 items-center font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted hover:text-accent m-0"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/account"
      title={raw}
      aria-label={`Account profile for ${display}`}
      className="inline-flex h-9 items-center gap-2 border border-border bg-bg-elevated px-3 text-ink transition-colors hover:border-accent hover:text-accent"
    >
      <span className="h-2 w-2 rounded-full bg-ok shrink-0" aria-hidden="true" />
      <span className="font-mono text-xs tracking-tight">{display}</span>
    </Link>
  );
}