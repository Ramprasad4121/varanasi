"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Check, Copy, ExternalLink, Wallet } from "lucide-react";
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
      />
      <section className="mx-auto max-w-[880px] px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-border bg-bg-elevated p-8 shadow-lift">
          <Badge tone="warn">Privy Setup Required</Badge>
          <h2 className="mt-4 font-display text-2xl font-medium text-ink">
            Configure embedded wallet authentication
          </h2>
          <p className="mt-3 font-sans text-[15px] leading-relaxed text-fg-body">
            Varanasi uses Privy so a community member can sign in with email, Google, GitHub, or a
            wallet — and get a self-custodial wallet without installing anything.
          </p>
          <ol className="mt-6 space-y-3 font-sans text-[15px] text-fg-body list-decimal list-inside">
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!userId) {
      setAgents([]);
      setHires([]);
      return;
    }
    setAgents(loadScoped<AgentRecord[]>(userId, LS_AGENTS, []));
    setHires(loadScoped<HireRecord[]>(userId, LS_TASKS, []));
  }, [userId]);

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!ready) {
    return (
      <div>
        <PageHero
          title="Profile"
          eyebrow="Profile"
          subtitle="Loading identity…"
        />
        <section className="mx-auto max-w-[960px] px-4 py-12 sm:px-6">
          <div className="h-44 animate-pulse rounded-xl bg-bg-muted border border-border" />
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
        />
        <section className="mx-auto max-w-[960px] px-4 py-12 sm:px-6">
          <div className="rounded-xl border border-border bg-bg-elevated p-8 shadow-lift sm:p-10">
            <h2 className="font-display text-2xl sm:text-3xl font-medium text-ink">Sign in to access your vault</h2>
            <p className="mt-3 font-sans text-[15px] leading-relaxed text-fg-body max-w-xl">
              A self-custodial wallet is initialized for you upon sign-in. Varanasi never stores private keys.
              Hire autonomous agents, enforce spending caps, and audit proofs directly from your vault.
            </p>
            <div className="mt-6">
              <BrandButton onClick={() => login()}>Sign in</BrandButton>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const address = wallet?.address ?? user?.wallet?.address ?? "";
  const email = user?.email?.address;
  const google = user?.google?.email;
  const github = user?.github?.username;
  const isWalletAuth = Boolean(user?.wallet?.address && !email && !google && !github);

  const authMethod = google
    ? "Google"
    : github
      ? "GitHub"
      : email
        ? "Email"
        : isWalletAuth
          ? "External Wallet"
          : "Privy Embedded Wallet";

  const rawIdentity = email || google || (github ? `@${github}` : address);
  const displayName = email || google || (github ? `@${github}` : (address ? shortAddr(address) : "Member"));

  return (
    <div>
      <PageHero
        title="Profile"
        eyebrow="Profile & Vault"
        subtitle="Kept with your account. Never the keys. Hires and listed agents follow this identity across browsers."
      />
      <section className="mx-auto flex flex-col max-w-[960px] gap-8 px-4 py-12 sm:px-6">
        {/* Account & Treasury Card */}
        <article className="border border-border bg-bg-elevated p-6 sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div
                aria-hidden="true"
                className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-accent"
              >
                {isWalletAuth || (!email && !google && !github) ? (
                  <Wallet className="h-6 w-6" />
                ) : (
                  <span className="font-display text-2xl font-medium">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-ok shrink-0" aria-hidden="true" />
                  <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">
                    Active Session
                  </p>
                </div>
                <h2 className="mt-1 font-display text-2xl font-medium text-ink truncate" title={rawIdentity}>
                  {displayName}
                </h2>
                <p className="mt-0.5 font-display text-sm text-fg-muted">
                  Signed in via {authMethod}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <BrandButton href="/hire" className="h-10 px-4 text-xs whitespace-nowrap">
                Hire an agent
              </BrandButton>
              <BrandButton variant="ghost" onClick={() => logout()} className="h-10 px-4 text-xs whitespace-nowrap">
                Sign out
              </BrandButton>
            </div>
          </div>

          <div className="mt-8 border-t border-border/70 pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">
                Onchain Treasury Wallet
              </p>
              <div className="flex items-center gap-4">
                <Link
                  href="/privy"
                  className="font-label text-xs text-accent hover:underline underline-offset-4 flex items-center gap-1"
                >
                  Treasury dashboard <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {address ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-border bg-bg p-3.5">
                <code className="font-mono text-sm text-ink break-all select-all">
                  {address}
                </code>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(address)}
                    className="inline-flex items-center gap-1.5 border border-border bg-bg-elevated px-2.5 py-1.5 font-label text-[11px] uppercase tracking-wider text-ink transition-colors hover:border-accent hover:text-accent"
                    aria-label="Copy wallet address"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-ok" />
                        <span className="text-ok">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  <a
                    href={sepoliaAddress(address)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 border border-border bg-bg-elevated px-2.5 py-1.5 font-label text-[11px] uppercase tracking-wider text-ink transition-colors hover:border-accent hover:text-accent"
                    aria-label="View on Etherscan"
                  >
                    <span>Etherscan</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ) : (
              <p className="font-sans text-[14px] italic text-fg-muted">
                Wallet is being created — refresh in a moment.
              </p>
            )}
            <p className="mt-3 font-sans text-[14px] leading-relaxed text-fg-body">
              Fund this self-custodial address before authorizing live mandates. The agent acts strictly within your signed cap.
            </p>
          </div>
        </article>

        {/* Mandates & Hires Card */}
        <article className="border border-border bg-bg-elevated p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Task Escrows</p>
              <h2 className="mt-1 font-display text-2xl font-medium text-ink">Mandates in this vault</h2>
            </div>
            <Badge tone={hires.length > 0 ? "ok" : "neutral"}>
              {hires.length} {hires.length === 1 ? "mandate" : "mandates"}
            </Badge>
          </div>

          {hires.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
              <p className="font-sans text-[15px] italic text-fg-muted">
                No hires yet. Authorize an agent mandate and it will appear here.
              </p>
              <div className="mt-4">
                <BrandButton href="/hire" variant="ghost" className="h-9 px-4 text-xs">
                  Create your first mandate →
                </BrandButton>
              </div>
            </div>
          ) : (
            <ul className="mt-6 divide-y divide-border border-t border-border">
              {hires.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-display text-lg text-ink font-medium">{task.agent}</p>
                    <p className="font-mono text-xs text-fg-muted mt-0.5">
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

        {/* Listed Agents Card */}
        <article className="border border-border bg-bg-elevated p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Aegis Registry</p>
              <h2 className="mt-1 font-display text-2xl font-medium text-ink">Identities you listed</h2>
            </div>
            <Badge tone={agents.length > 0 ? "ok" : "neutral"}>
              {agents.length} {agents.length === 1 ? "agent" : "agents"}
            </Badge>
          </div>

          {agents.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
              <p className="font-sans text-[15px] italic text-fg-muted">
                No listed agents yet. Register subnames under aegis.eth to build your agent portfolio.
              </p>
              <div className="mt-4">
                <BrandButton href="/agents" variant="ghost" className="h-9 px-4 text-xs">
                  Browse agent registry →
                </BrandButton>
              </div>
            </div>
          ) : (
            <ul className="mt-6 divide-y divide-border border-t border-border">
              {agents.map((agent) => (
                <li key={agent.sublabel} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-display text-lg text-ink font-medium">{agent.sublabel}.aegis.eth</p>
                    <p className="font-mono text-xs text-fg-muted mt-0.5">{shortAddr(agent.wallet)}</p>
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
