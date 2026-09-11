"use client";

import Link from "next/link";
import React from "react";
import { usePrivy } from "@privy-io/react-auth";
import { cn } from "@/lib/utils";

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
        className="inline-flex h-11 items-center border border-ink/80 px-4 font-label text-[11px] uppercase tracking-[0.14em] text-ink hover:bg-ink hover:text-bg transition-colors"
      >
        Sign in
      </Link>
    );
  }
  return <AuthSlotInner variant={variant} />;
}

function AuthSlotInner({ variant }: { variant: "nav" | "menu" }) {
  const { ready, authenticated, login, logout, user } = usePrivy();

  if (!ready) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          "inline-flex items-center border border-border px-4 font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted",
          variant === "menu" ? "h-12 w-full justify-start" : "h-11"
        )}
      >
        Sign in
      </button>
    );
  }

  if (!authenticated) {
    if (variant === "menu") {
      return (
        <button
          type="button"
          onClick={() => login()}
          className="flex h-12 items-center font-display text-[16px] font-medium text-accent text-left"
        >
          Sign in
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => login()}
        className="inline-flex h-11 items-center border border-ink/80 px-4 font-label text-[11px] uppercase tracking-[0.14em] text-ink hover:bg-ink hover:text-bg transition-colors"
      >
        Sign in
      </button>
    );
  }

  const label =
    user?.email?.address ??
    user?.google?.email ??
    user?.github?.username ??
    (user?.wallet?.address ? `${user.wallet.address.slice(0, 6)}…${user.wallet.address.slice(-4)}` : "Account");
  const short = label.includes("@") ? label.split("@")[0] : label;

  if (variant === "menu") {
    return (
      <div className="flex flex-col gap-1 py-2">
        <Link href="/account" className="flex h-12 items-center font-display text-[16px] font-medium text-accent">
          Account ({short})
        </Link>
        <button
          type="button"
          onClick={() => logout()}
          className="flex h-8 items-center font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted hover:text-accent"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/account"
        title={label}
        className="inline-flex h-11 items-center border border-ink/80 px-4 font-label text-[11px] uppercase tracking-[0.14em] text-ink hover:bg-ink hover:text-bg transition-colors"
      >
        {short}
      </Link>
    </div>
  );
}
