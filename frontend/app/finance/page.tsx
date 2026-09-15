"use client";

// Author: Ramprasad — community finance vault, colosseum grammar.
// Simulated deterministic vault (no network, no funds move). Every figure
// labeled simulated; contracts not deployed so nothing broadcasts.

import { useMemo, useState } from "react";
import { Badge } from "@/components/Badge";
import { BrandButton } from "@/components/BrandButton";
import { PageHero } from "@/components/PageHero";
import { SectionSep } from "@/components/SectionSep";
import {
  demoFinance,
  fmt,
  pct,
  recommendFrom,
} from "@/components/finance/demo";
import type { Address } from "@/finance-types";

const DEFAULT_ADDRESS =
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

function isAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

export default function FinancePage() {
  const [input, setInput] = useState<string>(DEFAULT_ADDRESS);
  const [address, setAddress] = useState<Address>(DEFAULT_ADDRESS);
  const [error, setError] = useState<string>("");

  const snapshot = useMemo(() => demoFinance(address), [address]);
  const recommendations = useMemo(
    () => recommendFrom(snapshot, address),
    [snapshot, address],
  );

  function apply(next: string) {
    const trimmed = next.trim();
    if (!isAddress(trimmed)) {
      setError("Enter a 0x address with 40 hex characters.");
      return;
    }
    setError("");
    setAddress(trimmed as Address);
  }

  return (
    <div>
      <PageHero
        title="Community Finance"
        eyebrow="Simulated vault"
        subtitle="Savings, group pools, loans, and collateral your agent can steward. All figures simulated — no real funds move."
      />

      <section className="mx-auto max-w-[880px] px-4 py-12 sm:px-6">
        <form
          className="rounded-xl border border-border bg-bg-elevated p-6 shadow-lift"
          onSubmit={(e) => {
            e.preventDefault();
            apply(input);
          }}
        >
          <label htmlFor="finance-address">Vault address</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="finance-address"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              aria-label="Vault address"
              className="font-mono"
            />
            <button type="submit" className="btn-solid shrink-0">
              Load vault
            </button>
          </div>
          {error ? (
            <p className="status" role="alert">
              {error}
            </p>
          ) : (
            <p className="muted mt-3">
              Deterministic per address — change the address and watch every
              figure change. <Badge tone="warn">simulated</Badge>
            </p>
          )}
        </form>
      </section>

      <SectionSep />

      <section className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <div className="max-w-[36rem]">
          <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">
            Portfolio
          </p>
          <h2 className="mt-2 font-display text-[clamp(1.9rem,3.6vw,2.9rem)] font-medium leading-[1.08] tracking-[-0.02em] text-ink">
            What the steward sees
          </h2>
        </div>
        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          <Panel
            title="Savings vault"
            figure={fmt(snapshot.savings.balance)}
            note={
              snapshot.savings.open
                ? "Open · simulated balance"
                : "Closed · simulated"
            }
          />
          <Panel
            title="Chit pool"
            figure={`${snapshot.chit.members.length} members · round ${snapshot.chit.round.toString()}`}
            note={`${fmt(snapshot.chit.config.contributionAmount)} per round · simulated`}
          />
          <Panel
            title="Active loan"
            figure={
              snapshot.loans.length > 0
                ? fmt(snapshot.loans[0].principal)
                : "None"
            }
            note={
              snapshot.loans.length > 0
                ? `${snapshot.loans[0].interestBps.toString()} bps · simulated`
                : "No open loans · simulated"
            }
          />
          <Panel
            title="Collateral"
            figure={fmt(snapshot.collateral.amount)}
            note="Locked against the loan · simulated"
          />
          <Panel
            title="Gold position"
            figure={`${snapshot.gold.grams.toString()}g · ${snapshot.gold.status}`}
            note={`${snapshot.gold.custodianName} · simulated`}
          />
          <Panel
            title="Credit score"
            figure={pct(snapshot.reputation.creditScoreBps)}
            note={
              snapshot.reputation.isFlagged
                ? "Flagged · simulated"
                : "Standing good · simulated"
            }
          />
        </ul>
      </section>

      <SectionSep />

      <section className="mx-auto max-w-[880px] px-4 sm:px-6">
        <div className="max-w-[36rem]">
          <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">
            Steward
          </p>
          <h2 className="mt-2 font-display text-[clamp(1.9rem,3.6vw,2.9rem)] font-medium leading-[1.08] tracking-[-0.02em] text-ink">
            What your steward recommends
          </h2>
        </div>
        <ul className="mt-8 divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-elevated">
          {recommendations.map((r) => (
            <li
              key={`${r.action}-${r.rationale.slice(0, 24)}`}
              className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-sans text-[15px] font-medium text-ink">
                  {r.action.replace(/_/g, " ")}
                </p>
                <p className="mt-1 font-sans text-[14px] leading-relaxed text-fg-body">
                  {r.rationale}
                </p>
              </div>
              <Badge
                tone={
                  r.riskLevel === "low"
                    ? "ok"
                    : r.riskLevel === "medium"
                      ? "warn"
                      : "bad"
                }
              >
                {r.riskLevel} · simulated
              </Badge>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <BrandButton href="/hire">Hire with a mandate</BrandButton>
          <BrandButton href="/docs#guides" variant="ghost">
            How the vault works
          </BrandButton>
        </div>
        <p className="mt-6 font-sans text-[14px] text-fg-muted">
          Finance contracts are not deployed — the agent steward throws instead
          of broadcasting, so demo state never moves funds.
        </p>
      </section>
    </div>
  );
}

function Panel({
  title,
  figure,
  note,
}: {
  title: string;
  figure: string;
  note: string;
}) {
  return (
    <li className="flex flex-col rounded-xl border border-border bg-bg-elevated p-6 shadow-lift">
      <div className="flex items-center justify-between gap-2">
        <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">
          {title}
        </p>
        <Badge tone="warn">simulated</Badge>
      </div>
      <p className="mt-3 font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        {figure}
      </p>
      <p className="mt-2 font-sans text-[14px] leading-relaxed text-fg-body">
        {note}
      </p>
    </li>
  );
}
