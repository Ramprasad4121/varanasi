"use client";

import Link from "next/link";
import React from "react";
import { UserRound } from "lucide-react";
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
        className="inline-flex h-11 items-center border border-ink/80 px-4 m-0 font-label text-[11px] uppercase tracking-[0.14em] text-ink hover:bg-ink hover:text-bg transition-colors"
      >
        Sign in
      </Link>
    );
  }
  return <AuthSlotInner variant={variant} />;
}

function AuthSlotInner({ variant }: { variant: "nav" | "menu" }) {
  const { ready, authenticated, login, logout, user } = usePrivy();

  const label =
    user?.email?.address ??
    user?.google?.email ??
    user?.github?.username ??
    "Account";

  if (!ready) {
    if (variant === "menu") {
      return (
        <button
          type="button"
          disabled
          className="flex h-12 items-center font-display text-[16px] text-fg-muted text-left m-0"
        >
          Sign in
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled
        aria-label="Account"
        className="grid h-10 w-10 place-items-center rounded-full border border-border text-fg-muted"
      >
        <UserRound className="h-[1.15rem] w-[1.15rem]" />
      </button>
    );
  }

  if (!authenticated) {
    if (variant === "menu") {
      return (
        <button
          type="button"
          onClick={() => login()}
          className="flex h-12 items-center font-display text-[16px] font-medium text-accent text-left m-0"
        >
          Sign in
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => login()}
        className="inline-flex h-11 items-center border border-ink/80 px-4 m-0 font-label text-[11px] uppercase tracking-[0.14em] text-ink hover:bg-ink hover:text-bg transition-colors"
      >
        Sign in
      </button>
    );
  }

  if (variant === "menu") {
    return (
      <div className="flex flex-col gap-1 py-2">
        <Link href="/account" className="flex h-12 items-center font-display text-[16px] font-medium text-accent">
          Account
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
      title={label}
      aria-label="Account"
      className="grid h-10 w-10 place-items-center rounded-full border border-ink/70 text-ink transition-colors hover:border-accent hover:text-accent"
    >
      <UserRound className="h-[1.15rem] w-[1.15rem]" />
    </Link>
  );
}