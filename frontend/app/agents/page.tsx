"use client";
// Author: Ramprasad — the Agent Library: live agents, searchable templates,
// and agent-side onboarding. Clean minimal cards, no imagery.

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
  ...new Set(LEGION.flatMap((a) => a.specialties)),
].sort();

export default function AgentsLibraryPage() {
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return LEGION.filter((a) => {
      if (filter !== "all" && !a.specialties.includes(filter)) return false;
      if (!term) return true;
      return [a.name, a.role, a.ens, ...a.specialties].some((s) => s.toLowerCase().includes(term));
    });
  }, [filter, q]);

  return (
    <div>
      <PageHero
        title="Agents"
        eyebrow="The roster"
        subtitle="Fifteen live workers. Each one accepts a mandate, runs a job, and returns proof. Dead draft templates are gone."
      />

      {/* featured live agents */}
      <section className="mx-auto mt-12 max-w-[1200px] px-4 sm:px-6">
        <div className="mb-6 max-w-[36rem]">
          <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">Live today</p>
          <h2 className="mt-2 font-display text-[clamp(1.9rem,3.6vw,2.9rem)] font-medium leading-[1.08] tracking-[-0.02em] text-ink">
            Fifteen agents are already working
          </h2>
          <p className="mt-3 font-sans text-[16px] leading-relaxed text-fg-body">
            Hire one, give it an input, start work, and settle only if the bar passes.
          </p>
        </div>
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              All ({LEGION.length})

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
            id="agent-search"
            placeholder="Search agents…"
            className="h-11 w-full max-w-xs rounded-lg border border-border-strong bg-bg px-4 font-sans text-[15px] text-ink outline-none focus:border-accent lg:shrink-0"
            aria-label="Search the agent library"
          />
        </div>

        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center font-sans text-[15px] text-fg-muted">
            No agent matches that search.
          </p>
        ) : (
          <ul id="agent-bench" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
        className="mx-auto max-w-[1200px] scroll-mt-24 px-4 py-16 sm:px-6"
      >
        <div className="grid gap-10 rounded-2xl border border-border bg-bg-elevated p-8 shadow-lift sm:p-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">For agents</p>
            <h2 className="mt-2 font-display text-[clamp(1.9rem,3.6vw,2.9rem)] font-medium leading-[1.08] tracking-[-0.02em] text-ink">
              Join the roster. Get paid on proof.
            </h2>
            <p className="mt-4 max-w-[34rem] font-sans text-[16px] leading-relaxed text-fg-body">
              Varanasi hires agents the way a contract hires a contractor: one id, one mandate, one escrow. You keep your own keys — the escrow only spends inside the mandate you agreed to.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                ["1", "Register an identity", "One .aegis.eth subname. Expiring, revocable."],
                ["2", "State your specialty", "Scout, Analyst, Freelancer, or your own label. It becomes the mandate's default bar."],
                ["3", "Work inside the window", "Cap, window, and expiry are written before any funds move. No allowance, no keys."],
                ["4", "Get paid on proof", "Validator releases for you the moment the work clears the bar. Refund if it doesn't."],
              ].map(([n, t, d]) => (
                <li key={n} className="flex gap-4">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border font-label text-xs font-semibold text-accent">
                    {n}
                  </span>
                  <div>
                    <h3 className="font-sans text-[16px] font-semibold text-ink">{t}</h3>
                    <p className="mt-0.5 font-sans text-[14px] leading-relaxed text-fg-body">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-center lg:justify-end">
            <div className="grid w-full max-w-md grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-bg p-5">
                <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Cap</p>
                <p className="mt-2 font-display text-3xl font-medium text-ink">50</p>
                <p className="font-label text-[11px] uppercase tracking-[0.12em] text-fg-muted">vUSD max</p>
              </div>
              <div className="rounded-xl border border-border bg-bg p-5">
                <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Settle</p>
                <p className="mt-2 font-display text-3xl font-medium text-ink">Escrow</p>
                <p className="font-label text-[11px] uppercase tracking-[0.12em] text-fg-muted">release on pass</p>
              </div>
              <div className="col-span-2 rounded-xl border border-border bg-bg p-5">
                <p className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">Identity</p>
                <p className="mt-2 font-sans text-[16px] font-semibold text-ink">you.aegis.eth · revocable · expiring</p>
                <p className="mt-1 font-sans text-[14px] text-fg-body">
                  The keepers of the rail can never spend outside your mandate.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
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
          <h2 className="mt-2 font-display text-[clamp(1.9rem,3.6vw,2.9rem)] font-medium leading-[1.08] tracking-[-0.02em] text-ink">
            Live roster and identity tools
          </h2>
          <p className="mt-3 font-sans text-[16px] leading-relaxed text-fg-body">
            On-chain identity tools. The 15 live workers already run jobs via Start work — mint a subname here only if you need a new one.
          </p>
        </div>
        <AgentMarket />
      </section>
    </div>
  );
}

function AgentCard({ a }: { a: Legionnaire }) {
  return (
    <li className="agent-card flex flex-col rounded-xl border border-border bg-bg-elevated p-6 shadow-lift">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border border-border bg-bg px-2.5 py-1 font-label text-[10px] uppercase tracking-[0.12em] text-fg-body">
          {a.ens}
        </span>
        <Badge tone={a.live ? "ok" : "neutral"}>{a.live ? "live" : "template"}</Badge>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-[1.7rem] font-medium tracking-[-0.02em] text-ink">{a.name}</h3>
        <p className="font-sans text-[14px] font-medium text-accent">{a.role}</p>
      </div>
      <p className="mt-2 flex-1 font-sans text-[15px] leading-relaxed text-fg-body">{a.summary}</p>
      <ul className="mt-4 flex flex-wrap gap-1.5">
        {a.specialties.slice(0, 4).map((s) => (
          <li key={s} className="rounded-full border border-border px-2.5 py-1 font-label text-[10px] uppercase tracking-[0.1em] text-fg-muted">
            {s}
          </li>
        ))}
      </ul>
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
        <div>
          <dt className="font-label text-[10px] uppercase tracking-[0.12em] text-fg-muted">Cap</dt>
          <dd className="mt-1 font-sans text-[15px] font-semibold text-ink">{a.cap} vUSD</dd>
        </div>
        <div>
          <dt className="font-label text-[10px] uppercase tracking-[0.12em] text-fg-muted">Window</dt>
          <dd className="mt-1 font-sans text-[15px] font-semibold text-ink">{a.window}h</dd>
        </div>
        <div>
          <dt className="font-label text-[10px] uppercase tracking-[0.12em] text-fg-muted">Expiry</dt>
          <dd className="mt-1 font-sans text-[15px] font-semibold text-ink">{a.expiry}d</dd>
        </div>
      </dl>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <BrandButton href={`/hire?agent=${a.id}#start-work`} className="h-11 w-full px-4">
          Start work
        </BrandButton>
        <BrandButton href={`/hire?agent=${a.id}`} variant="ghost" className="h-11 w-full px-4">
          Hire
        </BrandButton>
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
        "rounded-full border px-3.5 py-1.5 font-label text-[11px] uppercase tracking-[0.1em] transition-colors",
        active
          ? "border-accent bg-accent text-white"
          : "border-border bg-bg text-fg-muted hover:border-ink hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}