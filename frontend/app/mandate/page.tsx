import { BrandButton } from "@/components/BrandButton";
import { PageHero } from "@/components/PageHero";
import { GITHUB_URL, HOW, MANDATE_FIELDS } from "@/lib/site";

export default function MandatePage() {
  return (
    <div>
      <PageHero
        title="How a mandate works"
        eyebrow="The Mandate"
        subtitle="One signed object authorizes one escrowed task. You sign. Anyone can submit. Settlement never trusts a prompt."
        image="/images/mandate-scroll.jpg"
      />
      <section className="mx-auto grid max-w-[1100px] gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_280px]">
        <div>
          <ol className="grid gap-4 sm:grid-cols-2">
            {HOW.map((step) => (
              <li key={step.n} className="border border-border bg-bg-elevated">
                <div className="h-32 overflow-hidden border-b border-border bg-bg-muted">
                  <img src={step.image} alt="" className="h-full w-full object-cover mix-blend-multiply" />
                </div>
                <div className="p-6">
                  <p className="font-label text-[11px] uppercase tracking-[0.16em] text-accent">{step.n}</p>
                  <h2 className="mt-3 font-display text-2xl font-medium tracking-[-0.03em] text-ink">{step.title}</h2>
                  <p className="mt-2 font-display text-[16px] leading-relaxed text-fg-body">{step.body}</p>
                </div>
              </li>
            ))}
            <li className="border border-border bg-bg-elevated">
              <div className="h-32 overflow-hidden border-b border-border bg-bg-muted">
                <img src="/images/gate.jpg" alt="" className="h-full w-full object-cover mix-blend-multiply" />
              </div>
              <div className="p-6">
                <p className="font-label text-[11px] uppercase tracking-[0.16em] text-accent">IV</p>
                <h2 className="mt-3 font-display text-2xl font-medium tracking-[-0.03em] text-ink">Kill switch</h2>
                <p className="mt-2 font-display text-[16px] leading-relaxed text-fg-body">
                  Revoke the identity and every downstream gate closes. The agent cannot spend after that.
                </p>
              </div>
            </li>
          </ol>
          <ul className="mt-10 divide-y divide-border overflow-hidden border border-border">
            {MANDATE_FIELDS.map((row) => (
              <li key={row.field} className="grid gap-1 px-4 py-3 sm:grid-cols-[8.5rem_1fr] sm:items-baseline sm:gap-4">
                <span className="font-label text-sm text-ink">{row.field}</span>
                <span className="font-display text-base leading-relaxed text-fg-body">{row.meaning}</span>
              </li>
            ))}
          </ul>
        </div>
        <aside className="h-fit border border-ink/80 bg-bg-elevated">
          <img src="/images/mandate-scroll.jpg" alt="" className="h-40 w-full object-cover mix-blend-multiply" />
          <div className="p-6">
            <p className="font-label text-[11px] uppercase tracking-[0.16em] text-fg-muted">Spec</p>
            <p className="mt-2 font-display text-xl font-medium text-ink">EIP-712 · AP2-shaped</p>
            <p className="mt-3 font-display text-[16px] italic leading-relaxed text-fg-body">
              Domain-bound to VaranasiTaskEscrow. No owner sweep. No partial release. Miss the bar — auto-refund.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <BrandButton href="/hire" className="w-full">
                Hire with a mandate
              </BrandButton>
              <BrandButton href={`${GITHUB_URL}/blob/main/docs/MANDATE.md`} variant="ghost" className="w-full">
                Read the spec
              </BrandButton>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
