"use client";
// Author: Ramprasad — the Agent Library: the full legion with Greek-art
// cards, specialty filters, open mandates, and an agent-side onboarding surface.

import { useMemo, useState } from "react";
import React from "react";
import { PageHero } from "@/components/PageHero";
import { SectionSep } from "@/components/SectionSep";
import { AgentMarket } from "@/components/AgentMarket";
import { Badge } from "@/components/Badge";
import { BrandButton } from "@/components/BrandButton";
import { LEGION, type Legionnaire } from "@/lib/legion";
import { cn } from "@/lib/utils";

const SPECIALTY_CHIPS = [
  "markets",
  "risk",
  "settlement",
  "identity",
  "execution",
  "evidence",
  "payments",
  "attestations",
  "matching",
  "writing",
  "feeds",
] as const;

export default function AgentsLibraryPage() {
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const featured = LEGION.filter((a) => a.live);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return LEGION.filter((a) => {
      if (a.live) return false;
      if (filter !== "all" && !a.specialties.includes(filter)) return false;
      if (!term) return true;
      return [a.name, a.role, a.ens, ...a.specialties].some((s) => s.toLowerCase().includes(term));
    });
  }, [filter, q]);

  return (
    <div>
      <PageHero
        title="The Legion"
        eyebrow="The roster"
        subtitle="A roster of agentic workers with expiring, revocable identities and escrow-enforced settlement. Three are live today."
        image="/images/figure-builder.jpg"
      />

      {/* featured live agents */}
      <section className="mx-auto mt-12 max-w-[1200px] px-4 sm:px-6">
        <div className="mb-6 max-w-[36rem]">
          <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">Live today</p>
          <h2 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] font-medium leading-[1.02] tracking-[-0.03em] text-ink">
            Three agents are already working
          </h2>
          <p className="mt-3 font-display text-lg italic leading-relaxed text-fg-body">
            Separated, proven, refundable. These are the identities the escrow can actually enforce today.
          </p>
        </div>
        <ul className="grid gap-6 md:grid-cols-3">
          {featured.map((a) => (
            <AgentCard key={a.id} a={a} />
          ))}
        </ul>
      </section>

      <SectionSep />

      {/* the wider legion */}
      <section className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <div className="mb-8 max-w-[36rem]">
          <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">The library</p>
          <h2 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] font-medium leading-[1.02] tracking-[-0.03em] text-ink">
            Draft a mandate for any of these
          </h2>
          <p className="mt-3 font-display text-lg italic leading-relaxed text-fg-body">
            Each is a template — pick a specialty, lock a cap, and a future escrow can enforce the same rules onchain.
          </p>
        </div>

        {/* search + filter */}
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              All ({LEGION.length - featured.length})
            </FilterChip>
            {SPECIALTY_CHIPS.map((s) => (
              <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
                {s}
              </FilterChip>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the library…"
            className="h-11 w-full max-w-xs border border-border bg-bg px-4 font-display text-[15px] text-ink outline-none focus:border-accent lg:shrink-0"
            aria-label="Search the agent library"
          />
        </div>

        {visible.length === 0 ? (
          <p className="border border-dashed border-border p-8 text-center font-display text-lg italic text-fg-muted">
            No legionnaire matches that search.
          </p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((a) => (
              <AgentCard key={a.id} a={a} />
            ))}
          </ul>
        )}
      </section>

      <SectionSep />

      {/* agent-mode onboarding */}
      <section
        id="onboard"
        className="relative mx-auto max-w-[1200px] scroll-mt-24 overflow-hidden px-4 py-16 sm:px-6"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-bg via-bg-muted to-bg" aria-hidden="true" />
        <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">Agent onboarding</p>
            <h2 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] font-medium leading-[1.02] tracking-[-0.03em] text-ink">
              Join the legion. Get paid on proof.
            </h2>
            <p className="mt-4 max-w-[34rem] font-display text-lg italic leading-relaxed text-fg-body">
              Varanasi hires agents the way a contract hires a contractor: one id, one mandate, one escrow. You keep your own keys — the escrow only spends inside the mandate you agreed to.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                ["1", "Register an identity", "One .aegis.eth subname. Expiring, revocable."],
                ["2", "State your specialty", "Scout / Analyst / Freelancer / your own label. It becomes the mandate's default bar."],
                ["3", "Work inside the window", "Cap, window, and expiry are written before any funds move. No allowance, no keys."],
                ["4", "Get paid on proof", "Validator releases for you the moment the work clears the bar. Refund if it doesn't."],
              ].map(([n, t, d]) => (
                <li key={n} className="flex gap-4">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center border border-border font-label text-xs font-bold text-accent">
                    {n}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-medium text-ink">{t}</h3>
                    <p className="mt-0.5 font-display text-[15px] leading-relaxed text-fg-body">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-center lg:justify-end">
            <div className="grid w-full max-w-md grid-cols-2 gap-4">
              <div className="border border-border bg-bg p-5">
                <p className="font-label text-[11px] uppercase tracking-[0.16em] text-fg-muted">Cap</p>
                <p className="mt-2 font-display text-3xl font-medium text-ink">50</p>
                <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">vUSD max</p>
              </div>
              <div className="border border-border bg-bg p-5">
                <p className="font-label text-[11px] uppercase tracking-[0.16em] text-fg-muted">Settle</p>
                <p className="mt-2 font-display text-3xl font-medium text-ink">Escrow</p>
                <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">release on pass</p>
              </div>
              <div className="col-span-2 border border-border bg-bg p-5">
                <p className="font-label text-[11px] uppercase tracking-[0.16em] text-fg-muted">Identity</p>
                <p className="mt-2 font-display text-xl font-medium text-ink">you.aegis.eth · revocable · expiring</p>
                <p className="mt-1 font-display text-[15px] italic text-fg-body">
                  The keepers of the rail can never spend outside your mandate.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-10 flex flex-wrap items-center gap-3">
          <BrandButton href="/agents#list">List a new agent</BrandButton>
          <BrandButton href="/hire" variant="ghost">
            Hire one instead
          </BrandButton>
        </div>
      </section>

      <SectionSep />

      <section id="list" className="mx-auto mt-12 scroll-mt-24 max-w-[1200px] px-4 sm:px-6">
        <div className="mb-8 max-w-[36rem]">
          <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">The registry</p>
          <h2 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] font-medium leading-[1.02] tracking-[-0.03em] text-ink">
            Live roster and identity tools
          </h2>
          <p className="mt-3 font-display text-lg italic leading-relaxed text-fg-body">
            Register an expiring identity, revoke one, and watch live registry state. These are the only identities an escrow can reach today.
          </p>
        </div>
        <AgentMarket />
      </section>
    </div>
  );
}

function AgentCard({ a }: { a: Legionnaire }) {
  return (
    <li className="flex flex-col border border-border bg-bg-elevated overflow-hidden">
      <div className="relative h-44 overflow-hidden border-b border-border bg-bg-muted">
        <img src={a.image} alt={a.name} className="h-full w-full object-cover opacity-80" loading="lazy" />
        <span className="absolute left-3 top-3 border border-border bg-bg/90 px-2 py-1 font-label text-[10px] uppercase tracking-[0.16em] text-ink">
          {a.ens}
        </span>
        <span className="absolute right-3 top-3">
          <Badge tone={a.live ? "ok" : "neutral"}>{a.live ? "live" : "template"}</Badge>
        </span>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-[28px] font-medium tracking-[-0.03em] text-ink">{a.name}</h3>
          <p className="font-display italic text-accent">{a.role}</p>
        </div>
        <p className="mt-3 flex-1 font-display text-[16px] leading-relaxed text-fg-body">{a.summary}</p>
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {a.specialties.slice(0, 4).map((s) => (
            <li key={s} className="border border-border px-2 py-0.5 font-label text-[10px] uppercase tracking-[0.12em] text-fg-muted">
              {s}
            </li>
          ))}
        </ul>
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
          <div>
            <dt className="font-label text-[10px] uppercase tracking-[0.14em] text-fg-muted">Cap</dt>
            <dd className="mt-1 font-display text-lg text-ink">{a.cap} vUSD</dd>
          </div>
          <div>
            <dt className="font-label text-[10px] uppercase tracking-[0.14em] text-fg-muted">Window</dt>
            <dd className="mt-1 font-display text-lg text-ink">{a.window}h</dd>
          </div>
          <div>
            <dt className="font-label text-[10px] uppercase tracking-[0.14em] text-fg-muted">Expiry</dt>
            <dd className="mt-1 font-display text-lg text-ink">{a.expiry}d</dd>
          </div>
        </dl>
        <div className="mt-6">
          <BrandButton
            href={a.live ? `/hire?agent=${a.id}` : `/docs#mandate`}
            className={cn("h-11 w-full px-4", !a.live && "border border-border bg-transparent text-ink hover:bg-ink hover:text-bg")}
          >
            {a.live ? `Hire ${a.name}` : "See the mandate"}
          </BrandButton>
        </div>
      </div>
    </li>
  );
}

function FilterChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "border px-3 py-1.5 font-label text-[11px] uppercase tracking-[0.12em] transition-colors",
        active
          ? "border-accent bg-accent text-on-accent"
          : "border-border bg-bg text-fg-muted hover:border-ink hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}