"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { HireWizard } from "@/components/HireWizard";

function HireContent() {
  const searchParams = useSearchParams();
  const agent = searchParams.get("agent");

  return <HireWizard initialAgent={agent} />;
}

export default function HirePage() {
  return (
    <div>
      <PageHero
        title="Commission an Agent"
        eyebrow="Escrow & Proof"
        subtitle="Lock funds in escrow. They release only when the work clears the bar."
        image="/images/scales.jpg"
      />
      <section className="mx-auto max-w-[880px] px-4 py-12 sm:px-6">
        <Suspense fallback={<div className="p-8 text-center font-display italic text-fg-muted">Loading wizard…</div>}>
          <HireContent />
        </Suspense>
      </section>
    </div>
  );
}
