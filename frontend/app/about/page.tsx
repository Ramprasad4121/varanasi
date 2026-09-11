import { BrandButton } from "@/components/BrandButton";
import { PageHero } from "@/components/PageHero";
import { GITHUB_URL, ZEROES } from "@/lib/site";

export default function AboutPage() {
  return (
    <div>
      <PageHero
        title="About Varanasi"
        eyebrow="The Standard"
        subtitle="Named for a city that has settled vows for millennia. Built for agents that must not be trusted with the treasury."
        image="/images/palace.jpg"
      />
      <section className="mx-auto max-w-[760px] px-4 py-14 sm:px-6">
        <img
          src="/images/palace.jpg"
          alt="Roman palazzo engraving"
          className="mb-10 w-full border border-border object-cover mix-blend-multiply"
        />
        <div className="space-y-5 font-display text-lg leading-relaxed text-fg-body">
          <p>
            Agents move money on promises — signed intents, session keys, API credentials. The old way hands them a
            private key and a standing approval. One injected prompt, one hallucinated address, and the treasury drains.
          </p>
          <p>
            Varanasi moves the check to where the money moves. Mandates are verified at settlement. Reputation is
            grounded in payment. Release is gated on proof.
          </p>
          <p>
            The rail is AP2-shaped, ERC-8004-native, and rail-agnostic on x402. Identity lives in ENS. Intel comes from
            The Graph. Payments settle on Hedera. Enforcement is Solidity on Sepolia — mainnet-ready with no contract
            changes.
          </p>
          <p>
            This is a community product. Hire an agent from the homepage. Paste the agent prompt into any coding agent.
            Fork the repo. The contracts hold only user-escrowed funds.
          </p>
        </div>

        <ul className="mt-10 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2">
          {ZEROES.map((item) => (
            <li key={item.title} className="bg-bg p-6">
              <h2 className="font-display text-xl font-medium text-ink">{item.title}</h2>
              <p className="mt-2 font-display text-[16px] leading-relaxed text-fg-body">{item.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-10 border border-ink/80 bg-bg-elevated p-8">
          <p className="font-label text-[11px] uppercase tracking-[0.16em] text-fg-muted">Author</p>
          <p className="mt-2 font-display text-3xl font-medium text-ink">Ramprasad</p>
          <p className="mt-2 font-display italic text-[16px] text-fg-body">MIT license · Contracts hold only user-escrowed funds.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <BrandButton href={GITHUB_URL}>GitHub</BrandButton>
            <BrandButton href={`${GITHUB_URL}/blob/main/docs/SECURITY_REVIEW.md`} variant="ghost">
              Security review
            </BrandButton>
          </div>
        </div>
      </section>
    </div>
  );
}
