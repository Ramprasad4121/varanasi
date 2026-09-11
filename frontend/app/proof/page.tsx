import { BrandButton } from "@/components/BrandButton";
import { PageHero } from "@/components/PageHero";
import { CONTRACTS, ETHERSCAN_ADDR, GITHUB_URL, PROOF, STATS, proofHref, shortHash } from "@/lib/site";

export default function ProofPage() {
  return (
    <div>
      <PageHero
        title="Proof, not screenshots"
        eyebrow="Evidence"
        subtitle="Every claim here links to Sepolia or HashScan. Contracts are Sourcify-verified. There is no owner sweep."
        image="/images/scales.jpg"
      />
      <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-6">
        <ul className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-border md:grid-cols-4">
          {STATS.map((stat) => (
            <li key={stat.label} className="bg-bg-elevated p-5">
              <img src={stat.image} alt="" className="mb-3 h-14 w-14 object-contain opacity-80" />
              <p className="font-display text-4xl font-medium leading-none text-ink">
                {stat.value}
                {stat.suffix ? <span className="text-base text-fg-muted">{stat.suffix}</span> : null}
              </p>
              <p className="mt-2 font-display text-sm text-fg-muted">{stat.label}</p>
            </li>
          ))}
        </ul>

        <h2 className="mt-14 font-display text-2xl font-medium tracking-[-0.03em] text-ink">Live receipts</h2>
        <ul className="mt-4 divide-y divide-border overflow-hidden border border-border">
          {PROOF.map((item) => (
            <li key={item.hash} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-lg text-ink">{item.title}</p>
                <p className="font-label text-xs text-fg-muted">{shortHash(item.hash)}</p>
              </div>
              <a
                href={proofHref(item)}
                className="font-label text-[11px] uppercase tracking-[0.12em] text-accent underline underline-offset-4"
                target="_blank"
                rel="noreferrer"
              >
                {item.kind === "hedera" ? "Open HashScan ↗" : "Open Etherscan ↗"}
              </a>
            </li>
          ))}
        </ul>

        <h2 className="mt-14 font-display text-2xl font-medium tracking-[-0.03em] text-ink">Contracts · Sepolia</h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {CONTRACTS.map((c) => (
            <li key={c.address} className="border border-border bg-bg-elevated p-5">
              <p className="font-display text-xl font-medium text-ink">{c.name}</p>
              <p className="mt-1 font-display text-[16px] text-fg-body">{c.note}</p>
              <a
                href={`${ETHERSCAN_ADDR}/${c.address}`}
                className="mt-3 inline-block break-all font-label text-xs text-accent underline underline-offset-4"
                target="_blank"
                rel="noreferrer"
              >
                {c.address}
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap gap-3">
          <BrandButton href={`${GITHUB_URL}/blob/main/docs/DEMO.md`}>Full demo log</BrandButton>
          <BrandButton href="/hire" variant="ghost">
            Run a mandate
          </BrandButton>
        </div>
      </section>
    </div>
  );
}
