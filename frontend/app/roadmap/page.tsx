import { Badge } from "@/components/Badge";
import { BrandButton } from "@/components/BrandButton";
import { PageHero } from "@/components/PageHero";
import { SectionSep } from "@/components/SectionSep";
import { BRICKS, ROADMAP_INTRO, ROADMAP_OUTRO } from "@/lib/roadmap";

export default function RoadmapPage() {
  return (
    <div>
      <PageHero
        title="The Roadmap"
        eyebrow="No dates"
        subtitle="What we build, in what order. Every brick has to hold before the next one goes down."
        image="/images/gate.jpg"
      />
      <section className="mx-auto max-w-[760px] px-4 py-12 sm:px-6">
        {ROADMAP_INTRO.map((p) => (
          <p key={p.slice(0, 24)} className="font-display text-lg leading-relaxed text-fg-body">
            {p}
          </p>
        ))}
      </section>
      <SectionSep />
      <section className="mx-auto max-w-[760px] px-4 py-4 sm:px-6">
        <ol className="space-y-6">
          {BRICKS.map((brick) => (
            <li key={brick.n} id={`brick-${brick.n}`} className="border border-border bg-bg-elevated p-6 scroll-mt-24">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-label text-xs text-fg-muted">Brick {brick.n}</span>
                <Badge tone={brick.status === "shipped" ? "ok" : "warn"}>
                  {brick.status === "shipped" ? "Shipped" : "Planned"}
                </Badge>
              </div>
              <h2 className="mt-3 font-display text-2xl font-medium tracking-[-0.03em] text-ink">{brick.title}</h2>
              {brick.body.map((p, i) => (
                <p key={i} className="mt-3 font-display text-[16px] leading-relaxed text-fg-body">
                  {p}
                </p>
              ))}
            </li>
          ))}
        </ol>
      </section>
      <SectionSep />
      <section className="mx-auto max-w-[760px] px-4 py-12 sm:px-6">
        {ROADMAP_OUTRO.map((p, i) => (
          <p key={i} className="mt-5 font-display text-lg leading-relaxed text-fg-body first:mt-0">
            {p}
          </p>
        ))}
        <div className="mt-8 flex flex-wrap gap-3">
          <BrandButton href="/hire">Use what is live</BrandButton>
          <BrandButton href="/docs" variant="ghost">
            Read documentation
          </BrandButton>
        </div>
      </section>
    </div>
  );
}
