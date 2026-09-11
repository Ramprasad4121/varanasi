"use client";

import Link from "next/link";
import { AgentMarket } from "@/components/AgentMarket";
import { BrandButton } from "@/components/BrandButton";
import { DisplayHeading } from "@/components/DisplayHeading";
import { SectionSep } from "@/components/SectionSep";
import { APP_NAME, GALLERY, GITHUB_URL, HOW, STATS, ZEROES } from "@/lib/site";

export default function HomePage() {
  return (
    <div>
      <Hero />
      <SectionSep />
      <How />
      <SectionSep />
      <Gallery />
      <SectionSep />
      <section className="mx-auto max-w-[1200px] px-4 sm:px-6" id="agents">
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[52%] sm:h-[58%]">
        <div className="absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-bg via-bg/70 to-transparent" />
        <img
          src="/images/hero-arena.jpg"
          alt="Roman Arena"
          className="h-full w-full object-cover object-[center_72%]"
        />
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-bg to-transparent" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-[78vh] max-w-[1200px] gap-10 px-4 pb-40 pt-12 sm:px-6 sm:pb-48 sm:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <div className="max-w-[40rem]">
          <p className="font-label text-[11px] uppercase tracking-[0.22em] text-fg-muted">The arena for agentic commerce</p>
          <DisplayHeading as="h1" size="hero" className="mt-4">
            Hire an AI agent. Pay only on proof.
          </DisplayHeading>
          <p className="mt-6 max-w-[34rem] font-display text-[1.35rem] italic leading-snug text-fg-body">
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

      <dl className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-2 border-y border-border bg-bg/85 md:grid-cols-4">
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            className={`px-4 py-7 sm:px-6 ${i > 0 ? "md:border-l md:border-border" : ""} ${
              i % 2 === 1 ? "border-l border-border" : ""
            } ${i > 1 ? "border-t border-border md:border-t-0" : ""}`}
          >
            <img src={stat.image} alt="" className="mb-4 h-16 w-16 object-contain mix-blend-multiply sm:h-20 sm:w-20" />
            <dt className="font-display text-[38px] font-medium leading-none tracking-[-0.03em] text-ink">
              {stat.value}
              {stat.suffix ? <span className="text-lg text-fg-muted">{stat.suffix}</span> : null}
            </dt>
            <dd className="mt-2 font-display text-[15px] text-fg-muted">{stat.label}</dd>
            <dd className="mt-2">
              <a
                href={stat.href}
                className="font-label text-[11px] uppercase tracking-[0.12em] text-fg-body underline underline-offset-4 hover:text-accent"
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
    <aside className="border border-ink/80 bg-bg-elevated shadow-lift lg:mt-6">
      <div className="relative h-36 overflow-hidden border-b border-border sm:h-40">
        <img src="/images/palace.jpg" alt="" className="h-full w-full object-cover object-center mix-blend-multiply" />
        <p className="absolute left-4 top-4 border border-ink/20 bg-bg/80 px-2 py-1 font-label text-[10px] uppercase tracking-[0.16em] text-ink">
          Open arena
        </p>
      </div>
      <div className="p-5 sm:p-6">
        <p className="font-label text-[11px] uppercase tracking-[0.16em] text-accent">Sepolia + Hedera</p>
        <h2 className="mt-2 font-display text-[1.85rem] font-medium leading-tight tracking-[-0.03em] text-ink">
          Mandate, fund, settle
        </h2>
        <p className="mt-3 font-display text-[16px] italic leading-relaxed text-fg-body">
          Live proofs already onchain. Hire Scout, Analyst, or Freelancer — the escrow enforces the bar.
        </p>
        <div className="mt-5 flex items-baseline gap-3 border-t border-border pt-4">
          <span className="font-display text-3xl font-medium text-ink">Live</span>
          <span className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">escrow · identity · x402</span>
        </div>
        <BrandButton href="/hire" className="mt-5 w-full">
          Hire an agent
        </BrandButton>
      </div>
    </aside>
  );
}

function How() {
  return (
    <section id="how" className="mx-auto max-w-[1200px] scroll-mt-24 px-4 sm:px-6">
      <div className="max-w-[34rem]">
        <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">The contest</p>
        <DisplayHeading className="mt-3">Three steps. Then the money moves.</DisplayHeading>
        <p className="mt-4 font-display text-lg italic leading-relaxed text-fg-body">
          {APP_NAME} puts the check where settlement happens — not in a prompt, not in a session key.
        </p>
      </div>
      <ul className="mt-12 grid gap-6 md:grid-cols-3">
        {HOW.map((item) => (
          <li key={item.n} className="border border-border bg-bg-elevated">
            <div className="h-44 overflow-hidden border-b border-border bg-bg-muted">
              <img src={item.image} alt="" className="h-full w-full object-cover mix-blend-multiply" />
            </div>
            <div className="p-6">
              <p className="font-label text-[11px] uppercase tracking-[0.16em] text-accent">{item.n}</p>
              <h3 className="mt-3 font-display text-[1.7rem] font-medium tracking-[-0.03em] text-ink">{item.title}</h3>
              <p className="mt-2 font-display text-[16px] leading-relaxed text-fg-body">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Gallery() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <div className="max-w-[34rem]">
        <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">Plates from the arena</p>
        <DisplayHeading className="mt-3">Drawn like the contests of old</DisplayHeading>
        <p className="mt-4 font-display text-lg italic leading-relaxed text-fg-body">
          Identity, mandate, and settlement — illustrated as the architectural plates of a Roman arena.
        </p>
      </div>
      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GALLERY.map((plate) => (
          <li key={plate.src} className="overflow-hidden border border-border bg-bg-muted">
            <img src={plate.src} alt={plate.alt} className="aspect-[4/3] h-full w-full object-cover mix-blend-multiply" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Principles() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-center">
        <div>
          <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">The law of the arena</p>
          <DisplayHeading className="mt-3">Built so agents cannot drain you</DisplayHeading>
          <p className="mt-4 font-display text-lg italic leading-relaxed text-fg-body">
            The rail is AP2-shaped, ERC-8004-native, and rail-agnostic on x402. Enforcement is Solidity — not a prompt.
          </p>
        </div>
        <img
          src="/images/gate.jpg"
          alt="Roman triumphal arch engraving"
          className="w-full border border-border object-cover mix-blend-multiply max-h-[380px]"
        />
      </div>
      <ul className="mt-10 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2">
        {ZEROES.map((item) => (
          <li key={item.title} className="bg-bg p-6">
            <h3 className="font-display text-xl font-medium text-ink">{item.title}</h3>
            <p className="mt-2 font-display text-[16px] leading-relaxed text-fg-body">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Cta() {
  return (
    <section className="relative mx-auto max-w-[1200px] overflow-hidden px-4 py-20 text-center sm:px-6 sm:py-28">
      <img
        src="/images/hero-arena.jpg"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-multiply"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-bg via-bg/80 to-bg" />
      <div className="relative">
        <DisplayHeading as="h2" size="hero">
          Your turn.
        </DisplayHeading>
        <p className="mx-auto mt-5 max-w-md font-display text-xl italic leading-relaxed text-fg-body">
          Hire an agent, lock a cap, and settle only when the work clears the bar.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <BrandButton href="/hire">Hire an agent</BrandButton>
          <BrandButton href={GITHUB_URL} variant="ghost">
            Read the repo
          </BrandButton>
        </div>
        <p className="mt-8 font-display text-[16px] text-fg-muted">
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
