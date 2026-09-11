"use client";

import { useState } from "react";
import { PageHero } from "@/components/PageHero";
import { PoolIntel } from "@/components/PoolIntel";
import { SignalPanel } from "@/components/SignalPanel";
import { VerdictTimeline } from "@/components/VerdictTimeline";
import type { IntelRecord } from "@/components/aegis";

export default function ActivityPage() {
  const [intel, setIntel] = useState<IntelRecord | null>(null);

  return (
    <div>
      <PageHero
        title="The Ledger"
        eyebrow="Receipts & Signals"
        subtitle="Every x402 payment settled through Hedera, recorded with receipts."
        image="/images/river-moon.jpg"
      />
      <section className="mx-auto grid max-w-[1200px] gap-6 px-4 py-12 sm:px-6 lg:grid-cols-2">
        <PoolIntel intel={intel} onIntel={setIntel} />
        <SignalPanel />
        <div className="lg:col-span-2">
          <VerdictTimeline intel={intel} />
        </div>
      </section>
    </div>
  );
}
