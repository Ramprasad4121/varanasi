"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Badge } from "@/components/Badge";
import { BrandButton } from "@/components/BrandButton";
import { PageHero } from "@/components/PageHero";
import { LS_AGENTS, sepoliaAddress, type AgentRecord } from "../../components/aegis";
import { HAS_PRIVY, LS_TASKS, loadScoped, type HireRecord } from "../../lib/vault";

export default function AccountPage() {
  if (!HAS_PRIVY) return <SetupNotice />;
  return <AccountInner />;
}

function SetupNotice() {
  return (
    <div>
      <PageHero
        title="Profile"
        eyebrow="Authentication"
        subtitle="Sign in to manage your wallet and mandates."
        image="/images/scales.jpg"
      />
      <section className="mx-auto max-w-[880px] px-4 py-12 sm:px-6">
        <div className="border border-border bg-bg-elevated p-8">
          <Badge tone="warn">Privy Setup Required</Badge>
          <h2 className="mt-4 font-display text-2xl font-medium text-ink">
            Configure embedded wallet authentication
          </h2>
          <p className="mt-3 font-display text-base leading-relaxed text-fg-body">
            Varanasi uses Privy so a community member can sign in with email, Google, GitHub, or a
            wallet — and get a self-custodial wallet without installing anything.
          </p>
          <ol className="mt-6 space-y-3 font-display text-base text-fg-body list-decimal list-inside">
            <li>
              Create an app at <code className="font-label text-sm text-ink bg-bg p-1 border border-border">dashboard.privy.io</code>.
            </li>
            <li>
              Enable email, Google, GitHub, and wallet login. Allow this site’s origin.
            </li>
            <li>
              Set <code className="font-label text-sm text-ink bg-bg p-1 border border-border">NEXT_PUBLIC_PRIVY_APP_ID</code> in <code className="font-label text-sm text-ink bg-bg p-1 border border-border">frontend/.env.local</code> and restart.
            </li>
          </ol>
          <div className="mt-8">
            <BrandButton href="https://github.com/Ramprasad4121/varanasi/blob/main/frontend/PRIVY.md" variant="ghost">
              Read setup guide ↗
            </BrandButton>
          </div>
        </div>
      </section>
    </div>
  );
}

function AccountInner() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const userId = authenticated ? user?.id : undefined;
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [hires, setHires] = useState<HireRecord[]>([]);

  useEffect(() => {
    if (!userId) {
      setAgents([]);
      setHires([]);
      return;
    }
    setAgents(loadScoped<AgentRecord[]>(userId, LS_AGENTS, []));
    setHires(loadScoped<HireRecord[]>(userId, LS_TASKS, []));
  }, [userId]);

  if (!ready) {
    return (
      <div>
        <PageHero
          title="Profile"
          eyebrow="Profile"
          subtitle="Loading identity…"
          image="/images/scales.jpg"
        />
        <section className="mx-auto max-w-[880px] px-4 py-12 sm:px-6">
          <div className="h-40 animate-pulse bg-bg-muted border border-border" />
        </section>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div>
        <PageHero
          title="Profile"
          eyebrow="Profile"
          subtitle="Email, Google, GitHub, or a wallet you already have. A wallet is created for you."
          image="/images/scales.jpg"
        />
        <section className="mx-auto max-w-[880px] px-4 py-12 sm:px-6">
          <div className="border border-border bg-bg-elevated p-8">
            <h2 className="font-display text-2xl font-medium text-ink">Sign in to keep your vault</h2>
            <p className="mt-3 font-display text-base leading-relaxed text-fg-body">
              A self-custodial wallet is initialized for you upon sign-in. Varanasi never stores private keys.
            </p>
            <div className="mt-6">
              <BrandButton onClick={() => login()}>Sign in</BrandButton>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const identity =
    user?.email?.address ??
    user?.google?.email ??
    user?.github?.username ??
    user?.wallet?.address ??
    "Member";
  const method = user?.google
    ? "Google"
    : user?.github
      ? "GitHub"
      : user?.email
        ? "Email"
        : user?.wallet
          ? "Wallet"
          : "Privy";
  const address = wallet?.address ?? user?.wallet?.address ?? "";

  return (
    <div>
      <PageHero
        title="Profile"
        eyebrow="Profile"
        subtitle="Kept with the account. Never the keys. Hires and listed agents follow this identity across browsers."
        image="/images/scales.jpg"
      />
      <section className="mx-auto grid max-w-[880px] gap-6 px-4 py-12 sm:px-6">
        <article className="border border-border bg-bg-elevated p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-accent font-display text-2xl font-medium text-accent"
              >
                {(identity || "M").charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Identity</p>
                <h2 className="mt-1 font-display text-2xl font-medium text-ink">{identity}</h2>
                <p className="mt-1 font-display text-sm text-fg-muted">Signed in with {method}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <BrandButton href="/hire">Hire an agent</BrandButton>
              <BrandButton variant="ghost" onClick={() => logout()}>
                Sign out
              </BrandButton>
            </div>
          </div>
        </article>

        <article className="border border-border bg-bg-elevated p-6 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Treasury</p>
              <h2 className="mt-1 font-display text-2xl font-medium text-ink">Wallet</h2>
            </div>
            <BrandButton href="/privy" variant="ghost" className="h-10 px-4">
              Open treasury
            </BrandButton>
          </div>
          {address ? (
            <div className="mt-5 border border-border bg-bg p-3">
              <code className="font-label text-sm text-ink break-all">{address}</code>
            </div>
          ) : (
            <p className="mt-5 font-display italic text-fg-muted">
              Wallet is being created — refresh in a moment.
            </p>
          )}
          <p className="mt-3 font-display text-sm text-fg-body">
            Fund this address before a live hire, or connect an external wallet at sign-in.
          </p>
          {address ? (
            <p className="mt-3">
              <a
                href={sepoliaAddress(address)}
                target="_blank"
                rel="noreferrer"
                className="font-label text-xs text-accent underline underline-offset-4"
              >
                View transaction ↗
              </a>
            </p>
          ) : null}
        </article>

        <article className="border border-border bg-bg-elevated p-6 sm:p-8">
          <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Hires</p>
          <h2 className="mt-1 font-display text-2xl font-medium text-ink">Mandates in this vault</h2>
          {hires.length === 0 ? (
            <p className="mt-5 font-display italic text-fg-muted">
              No hires yet. Authorize a mandate and it lands here.
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-border border-t border-border">
              {hires.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-display text-lg text-ink font-medium">{task.agent}</p>
                    <p className="font-label text-xs text-fg-muted">
                      {shortAddr(task.id)} · {task.cap} vUSD
                    </p>
                  </div>
                  <Badge tone={task.status === "released" ? "ok" : task.status === "refunded" ? "bad" : "warn"}>
                    {task.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="border border-border bg-bg-elevated p-6 sm:p-8">
          <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Agents</p>
          <h2 className="mt-1 font-display text-2xl font-medium text-ink">Identities you listed</h2>
          {agents.length === 0 ? (
            <p className="mt-5 font-display italic text-fg-muted">No listed agents yet.</p>
          ) : (
            <ul className="mt-5 divide-y divide-border border-t border-border">
              {agents.map((agent) => (
                <li key={agent.sublabel} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-display text-lg text-ink font-medium">{agent.sublabel}.aegis.eth</p>
                    <p className="font-label text-xs text-fg-muted">{shortAddr(agent.wallet)}</p>
                  </div>
                  <Badge tone={agent.revoked ? "bad" : agent.pending ? "warn" : "ok"}>
                    {agent.revoked ? "revoked" : agent.pending ? "pending" : "authorized"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}

function shortAddr(value: string) {
  if (value.startsWith("0x") && value.length > 12) return `${value.slice(0, 6)}…${value.slice(-4)}`;
  return value;
}
