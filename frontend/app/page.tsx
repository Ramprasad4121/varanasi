"use client";

import Link from "next/link";
import { AgentMarket } from "@/components/AgentMarket";
import { BrandButton } from "@/components/BrandButton";
import { DisplayHeading } from "@/components/DisplayHeading";
import { Flame } from "@/components/Flame";
import { GhatsSkyline } from "@/components/Ghats";
import { Reveal } from "@/components/Reveal";
import { SectionSep } from "@/components/SectionSep";
import { APP_NAME, GALLERY, GITHUB_URL, HOW, STATS, ZEROES } from "@/lib/site";

export default function HomePage() {
  return (
    <div>
      <Hero />
      <SectionSep label="the ritual" deva="क्रम" />
      <How />
      <SectionSep label="plates from the city" />
      <Gallery />
      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6" id="agents">
        <Reveal>
          <div className="mb-10 max-w-[36rem]">
            <p className="flex items-center gap-3 font-label text-[11px] uppercase tracking-[0.18em] text-gold/80">
              <Flame size={11} withHalo={false} />
              The roster
            </p>
            <DisplayHeading className="mt-3">Agents for hire</DisplayHeading>
            <p className="mt-4 font-display text-lg italic leading-relaxed text-fg-body">
              Each agent is an ENSv2 name with an expiring, revocable authorization. You set the mandate. They never
              hold the keys.
            </p>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <AgentMarket />
        </Reveal>
      </section>
      <SectionSep label="zero in the way" deva="शून्य" />
      <Principles />
      <Cta />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* the city, low on the water, behind everything */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[64%]" aria-hidden="true">
        <div
          className="h-full w-full opacity-45"
          style={{
            backgroundImage: "url(/images/ghats-night.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "center 62%",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-bg via-bg/55 to-bg/25" />
      </div>

      {/* प्रमाण — proof, written large and faint */}
      <span
        className="devanagari pointer-events-none absolute -right-6 top-8 select-none text-gold/[0.05] sm:top-2"
        style={{ fontSize: "clamp(11rem, 26vw, 24rem)", lineHeight: 1 }}
        aria-hidden="true"
      >
        प्रमाण
      </span>

      {/* moonlight travelling on the water */}
      <div className="river-shimmer pointer-events-none absolute inset-x-0 bottom-[170px] h-14 sm:bottom-[210px]" aria-hidden="true" />

      {/* the ghats themselves */}
      <GhatsSkyline className="pointer-events-none absolute inset-x-0 bottom-0 h-[180px] sm:h-[220px]" />

      {/* a lamp, drifting above the tallest spire */}
      <div className="drift pointer-events-none absolute bottom-[168px] left-[71.5%] hidden md:block" aria-hidden="true">
        <Flame size={46} />
      </div>

      <div className="relative z-10 mx-auto grid min-h-[88vh] max-w-[1200px] items-center gap-10 px-4 pb-44 pt-16 sm:px-6 lg:grid-cols-[1.12fr_0.88fr] lg:pb-52">
        <div className="max-w-[42rem]">
          <p className="flex items-center gap-3 font-label text-[11px] uppercase tracking-[0.24em] text-gold/90">
            <span className="devanagari text-[15px] normal-case tracking-normal text-gold/70">काशी</span>
            <span className="h-px w-8 bg-gold/40" />
            The enforcement rail for agentic commerce
          </p>
          <DisplayHeading as="h1" size="hero" className="mt-5">
            Hire an AI agent.
            <br />
            Pay only on <span className="flame-text">proof</span>.
          </DisplayHeading>
          <p className="mt-6 max-w-[34rem] font-display text-[1.25rem] italic leading-snug text-fg-body">
            Set a spending cap. The agent works inside it. Miss the bar — you are refunded, with the evidence onchain.
            Never hand over keys.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <BrandButton href="/hire">Light the mandate</BrandButton>
            <BrandButton href="/mandate" variant="ghost">
              See how it works
            </BrandButton>
          </div>
          <p className="mt-6 flex items-center gap-2.5 font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-river text-river" />
            Sepolia + Hedera · escrow · identity · x402
          </p>
        </div>

        <Reveal delay={200} className="lg:mt-6">
          <AartiCard />
        </Reveal>
      </div>

      {/* stats band — resting on the waterline */}
      <dl className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-2 border-y border-gold/20 bg-bg/75 backdrop-blur-sm md:grid-cols-4">
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            className={`px-4 py-6 sm:px-6 ${i > 0 ? "md:border-l md:border-gold/15" : ""} ${
              i % 2 === 1 ? "border-l border-gold/15" : ""
            } ${i > 1 ? "border-t border-gold/15 md:border-t-0" : ""}`}
          >
            <dt className="font-display text-[clamp(2.1rem,3.4vw,2.9rem)] font-medium leading-none tracking-[-0.03em] text-ink">
              {stat.value}
              {stat.suffix ? <span className="text-base text-fg-muted">{stat.suffix}</span> : null}
            </dt>
            <dd className="mt-2 font-display text-[14px] text-fg-muted">{stat.label}</dd>
            <dd className="mt-2.5">
              <a
                href={stat.href}
                className="group inline-flex items-center gap-2 font-label text-[10px] uppercase tracking-[0.12em] text-fg-body underline decoration-gold/30 underline-offset-4 transition-colors hover:text-accent-link hover:decoration-accent/60"
                target="_blank"
                rel="noreferrer"
              >
                <span className="inline-block h-1 w-1 rounded-full bg-river" />
                live · {stat.proof} ↗
              </a>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AartiCard() {
  return (
    <aside className="border border-gold/25 bg-bg-elevated/80 shadow-lift backdrop-blur-sm">
      <div className="relative h-36 overflow-hidden border-b border-gold/20 sm:h-40">
        <div
          className="h-full w-full opacity-80"
          style={{
            backgroundImage: "url(/images/aarti-flame.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg-elevated via-transparent to-transparent" />
        <p className="absolute left-3 top-3 border border-gold/30 bg-bg/70 px-2 py-1 font-label text-[10px] uppercase tracking-[0.16em] text-gold backdrop-blur-sm">
          The evening aarti
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
          <span className="flex items-center gap-2 font-display text-2xl font-medium text-ink">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-river text-river" />
            Live
          </span>
          <span className="font-label text-[10px] uppercase tracking-[0.14em] text-fg-muted">
            escrow · identity · x402
          </span>
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
      <Reveal>
        <div className="max-w-[34rem]">
          <p className="flex items-center gap-3 font-label text-[11px] uppercase tracking-[0.18em] text-gold/80">
            <Flame size={11} withHalo={false} />
            The ritual
          </p>
          <DisplayHeading className="mt-3">Three steps. Then the money moves.</DisplayHeading>
          <p className="mt-4 font-display text-lg italic leading-relaxed text-fg-body">
            {APP_NAME} puts the check where settlement happens — not in a prompt, not in a session key.
          </p>
        </div>
      </Reveal>
      <ul className="mt-10 grid gap-5 md:grid-cols-3">
        {HOW.map((item, i) => (
          <li key={item.n}>
            <Reveal delay={i * 120} className="h-full">
              <div className="group h-full border border-border bg-bg-elevated/60 p-6 transition-colors duration-200 hover:border-gold/40">
              <p className="flame-text font-display text-[3.4rem] font-medium leading-none tracking-[-0.03em]">
                {item.n}
              </p>
              <div className="gold-hairline mt-5 opacity-60 transition-opacity group-hover:opacity-100" />
              <h3 className="mt-5 font-display text-[1.5rem] font-medium tracking-[-0.03em] text-ink">{item.title}</h3>
                <p className="mt-2 font-display text-[15px] leading-relaxed text-fg-body">{item.body}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Gallery() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
      <Reveal>
        <div className="max-w-[34rem]">
          <p className="flex items-center gap-3 font-label text-[11px] uppercase tracking-[0.18em] text-gold/80">
            <Flame size={11} withHalo={false} />
            Plates from the city
          </p>
          <DisplayHeading className="mt-3">Drawn like the river remembers</DisplayHeading>
          <p className="mt-4 font-display text-lg italic leading-relaxed text-fg-body">
            Identity, mandate, escrow, proof — the rail, painted as a night on the ghats.
          </p>
        </div>
      </Reveal>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GALLERY.map((plate, i) => (
          <li key={plate.src}>
            <Reveal delay={i * 100}>
              <figure className="group border border-border bg-bg-muted transition-colors duration-200 hover:border-gold/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={plate.src}
                alt={plate.alt}
                className="aspect-[4/3] w-full object-cover opacity-85 transition-opacity duration-200 group-hover:opacity-100"
                loading="lazy"
              />
              <figcaption className="flex items-center justify-between border-t border-border px-3.5 py-3">
                <span className="font-label text-[10px] uppercase tracking-[0.16em] text-gold/80">{plate.caption}</span>
                <span className="devanagari text-[13px] text-gold/50">{plate.deva}</span>
                </figcaption>
              </figure>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Principles() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
      <Reveal>
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="flex items-center gap-3 font-label text-[11px] uppercase tracking-[0.18em] text-gold/80">
              <Flame size={11} withHalo={false} />
              The law of the river
            </p>
            <DisplayHeading className="mt-3">Built so agents cannot drain you</DisplayHeading>
            <p className="mt-4 font-display text-lg italic leading-relaxed text-fg-body">
              The rail is AP2-shaped, ERC-8004-native, and rail-agnostic on x402. Enforcement is Solidity — not a
              prompt.
            </p>
          </div>
          <div className="relative overflow-hidden border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/spire-dawn.jpg"
              alt="Temple spires at first light over the river"
              className="h-full max-h-[320px] w-full object-cover opacity-80"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-bg/70 via-transparent to-transparent" />
            <p className="devanagari absolute bottom-3 right-4 text-lg text-gold/70">काशी</p>
          </div>
        </div>
      </Reveal>
      <ul className="mt-8 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2">
        {ZEROES.map((item, i) => (
          <li key={item.title}>
            <Reveal delay={i * 90} className="h-full">
              <div className="flex h-full gap-5 bg-bg p-5">
                <span className="flame-text font-display text-[3.6rem] font-medium leading-[0.85] tracking-[-0.03em]">
                  0
                </span>
                <div>
                  <h3 className="font-display text-lg font-medium text-ink">{item.title}</h3>
                  <p className="mt-1.5 font-display text-[15px] leading-relaxed text-fg-body">{item.body}</p>
                </div>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Cta() {
  return (
    <section className="relative mx-auto max-w-[1200px] overflow-hidden px-4 py-16 text-center sm:px-6 sm:py-24">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: "url(/images/aarti-flame.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center 40%",
        }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-bg via-bg/80 to-bg" aria-hidden="true" />
      <Reveal className="relative">
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
          <Link href="/activity" className="text-accent-link underline decoration-from-font underline-offset-4">
            live activity
          </Link>{" "}
          to watch intel, signals, and verdicts.
        </p>
      </Reveal>
    </section>
  );
}
