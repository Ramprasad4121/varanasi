"use client";

import Link from "next/link";
import { AgentMarket } from "@/components/AgentMarket";
import { BrandButton } from "@/components/BrandButton";
import { DisplayHeading } from "@/components/DisplayHeading";
import { SectionSep } from "@/components/SectionSep";
import { APP_NAME, GALLERY, GITHUB_URL, HOW, STATS, ZEROES } from "@/lib/site";
import { Engraving } from "@/components/Engraving";

export default function HomePage() {
  return (
    <div>
      <Hero />
      <SectionSep />
      <How />
      <SectionSep />
      <Gallery />
      <SectionSep />
      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6" id="agents">
        <div className="mb-10 max-w-[36rem]">
          <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">The roster</p>
          <DisplayHeading className="mt-3">Agents for hire</DisplayHeading>
          <p className="mt-4 font-display text-lg italic leading-relaxed text-fg-body">
            Each agent is an ENSv2 name with an expiring, revocable authorization. You set the mandate. They never hold the keys.
          </p>
        </div>
        <AgentMarket />
      </section>
      <SectionSep />
      <Principles />
      <Cta />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background arena image — contained properly */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[50%] sm:h-[55%]">
        <div className="absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-bg via-bg/80 to-transparent" />
        <Engraving variant="arena" className="h-full w-full text-ink opacity-[0.14]" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg to-transparent" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-[72vh] max-w-[1200px] gap-8 px-4 pb-32 pt-10 sm:px-6 sm:pb-40 sm:pt-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <div className="max-w-[40rem]">
          <p className="font-label text-[11px] uppercase tracking-[0.22em] text-fg-muted">The arena for agentic commerce</p>
          <DisplayHeading as="h1" size="hero" className="mt-4">
            Hire an AI agent. Pay only on proof.
          </DisplayHeading>
          <p className="mt-6 max-w-[34rem] font-display text-[1.25rem] italic leading-snug text-fg-body">
            Set a spending cap. The agent works inside it. Miss the bar — you are refunded. Never hand over keys.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <BrandButton href="/hire">Enter the arena</BrandButton>
            <BrandButton href="/mandate" variant="ghost">
              See the mandate
            </BrandButton>
          </div>
        </div>

        <EventCard />
      </div>

      {/* Stats band */}
      <dl className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-2 border-y border-border bg-bg/90 backdrop-blur-sm md:grid-cols-4">
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            className={`px-4 py-6 sm:px-6 ${i > 0 ? "md:border-l md:border-border" : ""} ${
              i % 2 === 1 ? "border-l border-border" : ""
            } ${i > 1 ? "border-t border-border md:border-t-0" : ""}`}
          >
            <div className="mb-3 inline-flex h-12 w-12 items-center justify-center border border-border bg-bg-muted text-ink sm:h-14 sm:w-14">
              <Engraving variant={stat.plate} className="h-8 w-8 sm:h-9 sm:w-9" />
            </div>
            <dt className="font-display text-[32px] font-medium leading-none tracking-[-0.03em] text-ink">
              {stat.value}
              {stat.suffix ? <span className="text-base text-fg-muted">{stat.suffix}</span> : null}
            </dt>
            <dd className="mt-1.5 font-display text-[14px] text-fg-muted">{stat.label}</dd>
            <dd className="mt-1.5">
              <a
                href={stat.href}
                className="font-label text-[10px] uppercase tracking-[0.12em] text-fg-body underline underline-offset-4 hover:text-accent"
                target="_blank"
                rel="noreferrer"
              >
                live · {stat.proof}
              </a>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function EventCard() {
  return (
    <aside className="border border-ink/60 bg-bg-elevated shadow-lift lg:mt-4">
      <div className="relative h-32 overflow-hidden border-b border-border sm:h-36">
        <Engraving variant="palace" title="The palace of records" className="h-full w-full text-ink opacity-70" />
        <p className="absolute left-3 top-3 border border-ink/20 bg-bg/85 px-2 py-1 font-label text-[10px] uppercase tracking-[0.16em] text-ink">
          Open arena
        </p>
      </div>
      <div className="p-5">
        <p className="font-label text-[11px] uppercase tracking-[0.16em] text-accent">Sepolia + Hedera</p>
        <h2 className="mt-2 font-display text-[1.6rem] font-medium leading-tight tracking-[-0.03em] text-ink">
          Mandate, fund, settle
        </h2>
        <p className="mt-2 font-display text-[15px] italic leading-relaxed text-fg-body">
          Live proofs already onchain. Hire Scout, Analyst, or Freelancer — the escrow enforces the bar.
        </p>
        <div className="mt-4 flex items-baseline gap-3 border-t border-border pt-3">
          <span className="font-display text-2xl font-medium text-ink">Live</span>
          <span className="font-label text-[10px] uppercase tracking-[0.14em] text-fg-muted">escrow · identity · x402</span>
        </div>
        <BrandButton href="/hire" className="mt-4 w-full">
          Hire an agent
        </BrandButton>
      </div>
    </aside>
  );
}

function How() {
  return (
    <section id="how" className="mx-auto max-w-[1200px] scroll-mt-24 px-4 py-16 sm:px-6">
      <div className="max-w-[34rem]">
        <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">The contest</p>
        <DisplayHeading className="mt-3">Three steps. Then the money moves.</DisplayHeading>
        <p className="mt-4 font-display text-lg italic leading-relaxed text-fg-body">
          {APP_NAME} puts the check where settlement happens — not in a prompt, not in a session key.
        </p>
      </div>
      <ul className="mt-10 grid gap-5 md:grid-cols-3">
        {HOW.map((item) => (
          <li key={item.n} className="flex flex-col border border-border bg-bg-elevated overflow-hidden">
            <div className="h-40 overflow-hidden border-b border-border bg-bg-muted text-ink">
              <Engraving variant={item.plate} className="h-full w-full opacity-70" />
            </div>
            <div className="p-5">
              <p className="font-label text-[11px] uppercase tracking-[0.16em] text-accent">{item.n}</p>
              <h3 className="mt-2 font-display text-[1.5rem] font-medium tracking-[-0.03em] text-ink">{item.title}</h3>
              <p className="mt-2 font-display text-[15px] leading-relaxed text-fg-body">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Gallery() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
      <div className="max-w-[34rem]">
        <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">Plates from the arena</p>
        <DisplayHeading className="mt-3">Drawn like the contests of old</DisplayHeading>
        <p className="mt-4 font-display text-lg italic leading-relaxed text-fg-body">
          Identity, mandate, and settlement — illustrated as the architectural plates of a Roman arena.
        </p>
      </div>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GALLERY.map((plate) => (
          <li key={plate.alt} className="overflow-hidden border border-border bg-bg-muted text-ink">
            <div className="aspect-[4/3] w-full p-3 opacity-80">
              <Engraving variant={plate.variant} title={plate.alt} className="h-full w-full" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Principles() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div>
          <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">The law of the arena</p>
          <DisplayHeading className="mt-3">Built so agents cannot drain you</DisplayHeading>
          <p className="mt-4 font-display text-lg italic leading-relaxed text-fg-body">
            The rail is AP2-shaped, ERC-8004-native, and rail-agnostic on x402. Enforcement is Solidity — not a prompt.
          </p>
        </div>
        <div className="border border-border bg-bg-muted p-6 text-ink opacity-90">
          <Engraving variant="gate" title="Roman triumphal arch" className="mx-auto w-full max-h-[280px]" />
        </div>
      </div>
      <ul className="mt-8 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2">
        {ZEROES.map((item) => (
          <li key={item.title} className="bg-bg p-5">
            <h3 className="font-display text-lg font-medium text-ink">{item.title}</h3>
            <p className="mt-1.5 font-display text-[15px] leading-relaxed text-fg-body">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Cta() {
  return (
    <section className="relative mx-auto max-w-[1200px] overflow-hidden px-4 py-16 text-center sm:px-6 sm:py-24">
      <Engraving variant="arena" className="pointer-events-none absolute inset-0 h-full w-full text-ink opacity-[0.10]" />
      <div className="absolute inset-0 bg-gradient-to-b from-bg via-bg/85 to-bg" />
      <div className="relative">
        <DisplayHeading as="h2" size="hero">
          Your turn.
        </DisplayHeading>
        <p className="mx-auto mt-4 max-w-md font-display text-xl italic leading-relaxed text-fg-body">
          Hire an agent, lock a cap, and settle only when the work clears the bar.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <BrandButton href="/hire">Hire an agent</BrandButton>
          <BrandButton href={GITHUB_URL} variant="ghost">
            Read the repo
          </BrandButton>
        </div>
        <p className="mt-6 font-display text-[15px] text-fg-muted">
          Or open{" "}
          <Link href="/activity" className="text-accent underline decoration-from-font underline-offset-4">
            live activity
          </Link>{" "}
          to watch intel, signals, and verdicts.
        </p>
      </div>
    </section>
  );
}
