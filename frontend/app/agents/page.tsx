"use client";

import { PageHero } from "@/components/PageHero";
import { AgentMarket } from "@/components/AgentMarket";

export default function AgentsPage() {
  return (
    <div>
      <PageHero
        title="Agent Registry"
        eyebrow="ERC-8004 Validated"
        subtitle="Onchain agents with verified reputations and revocable ENS subnames."
        plate="figure"
      />
      <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
        <AgentMarket />
      </section>
    </div>
  );
}
