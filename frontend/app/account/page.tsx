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
        title="Your Vault"
        eyebrow="Authentication"
        subtitle="Sign in to manage your embedded Sepolia treasury and agent mandates."
        plate="scales"
      />
      <section className="mx-auto max-w-[880px] px-4 py-12 sm:px-6">
        <div className="border border-border bg-bg-elevated p-8">
          <Badge tone="warn">Privy Setup Required</Badge>
          <h2 className="mt-4 font-display text-2xl font-medium text-ink">
            Configure embedded wallet authentication
          </h2>
          <p className="mt-3 font-display text-base leading-relaxed text-fg-body">
            Varanasi uses Privy so a community member can sign in with email, Google, GitHub, or a
            wallet — and get a self-custodial Sepolia wallet without installing MetaMask.
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
          title="Your Vault"
          eyebrow="Account Vault"
          subtitle="Loading identity and security context…"
          plate="scales"
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
          title="Your Vault"
          eyebrow="Account Vault"
          subtitle="Email, Google, GitHub, or a wallet you already have. An embedded Sepolia wallet is created for you."
          plate="scales"
        />
        <section className="mx-auto max-w-[880px] px-4 py-12 sm:px-6">
          <div className="border border-border bg-bg-elevated p-8">
            <h2 className="font-display text-2xl font-medium text-ink">Sign in to keep your vault</h2>
            <p className="mt-3 font-display text-base leading-relaxed text-fg-body">
              An embedded self-custodial Sepolia wallet is initialized for you upon sign-in. Varanasi never stores private keys.
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
        title="Your Vault"
        eyebrow="Account Vault"
        subtitle="Kept with the account. Never the keys. Hires and listed agents follow this identity across browsers."
        plate="scales"
      />
      <section className="mx-auto grid max-w-[880px] gap-6 px-4 py-12 sm:px-6">
        <article className="border border-border bg-bg-elevated p-6">
          <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Identity</p>
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-medium text-ink">{identity}</h2>
              <p className="mt-1 font-display text-sm text-fg-muted">Signed in with {method}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <BrandButton href="/hire">Hire an agent</BrandButton>
              <BrandButton variant="ghost" onClick={() => logout()}>
                Sign out
              </BrandButton>
            </div>
          </div>
        </article>

        <article className="border border-border bg-bg-elevated p-6">
          <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Treasury wallet</p>
          <h2 className="mt-2 font-display text-2xl font-medium text-ink">Embedded Sepolia</h2>
          {address ? (
            <div className="mt-4 space-y-2">
              <p>
                <code className="font-label text-sm text-ink bg-bg p-2 border border-border inline-block break-all">
                  {address}
                </code>
              </p>
              <p>
                <a
                  href={sepoliaAddress(address)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-label text-xs text-accent underline underline-offset-4"
                >
                  View on Etherscan ↗
                </a>
              </p>
            </div>
          ) : (
            <p className="mt-4 font-display text-sm italic text-fg-muted">
              Wallet is being created — refresh in a moment.
            </p>
          )}
          <p className="mt-4 font-display text-sm text-fg-body">
            Fund this address from a Sepolia faucet before a live hire. Or connect an external wallet at sign-in.
          </p>
          <div className="mt-6">
            <BrandButton href="/privy" variant="ghost">
              Open treasury
            </BrandButton>
          </div>
        </article>

        <article className="border border-border bg-bg-elevated p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Hires</p>
              <h2 className="mt-2 font-display text-2xl font-medium text-ink">Mandates in this vault</h2>
            </div>
            <BrandButton href="/hire" variant="ghost">
              Hire
            </BrandButton>
          </div>
          {hires.length === 0 ? (
            <p className="mt-5 font-display italic text-fg-muted">
              No hires yet. Authorize a mandate and it lands here.
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-border border border-border overflow-hidden">
              {hires.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 bg-bg px-4 py-3">
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

        <article className="border border-border bg-bg-elevated p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Agents</p>
              <h2 className="mt-2 font-display text-2xl font-medium text-ink">Identities you listed</h2>
            </div>
            <BrandButton href="/agents" variant="ghost">
              Roster
            </BrandButton>
          </div>
          {agents.length === 0 ? (
            <p className="mt-5 font-display italic text-fg-muted">No listed agents yet.</p>
          ) : (
            <ul className="mt-5 divide-y divide-border border border-border overflow-hidden">
              {agents.map((agent) => (
                <li key={agent.sublabel} className="flex flex-wrap items-center justify-between gap-3 bg-bg px-4 py-3">
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
