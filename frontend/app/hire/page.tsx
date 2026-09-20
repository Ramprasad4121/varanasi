/**
 * @author Ramprasad — server-rendered hire page.
 * Passing searchParams as a prop avoids the client Suspense fallback so
 * /hire is never stuck on "Loading wizard…".
 */
import { PageHero } from "@/components/PageHero";
import { HireWizard } from "@/components/HireWizard";

export default function HirePage({
  searchParams,
}: {
  searchParams?: { agent?: string | string[] };
}) {
  const raw = searchParams?.agent;
  const agent = Array.isArray(raw) ? raw[0] : raw;

  return (
    <div>
      <PageHero
        title="Commission an Agent"
        eyebrow="Escrow & Proof"
        subtitle="Lock funds in escrow. They release only when the work clears the bar."
      />
      <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
        <HireWizard initialAgent={agent} />
      </section>
    </div>
  );
}
