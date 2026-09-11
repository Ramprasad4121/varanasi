"use client";

import Treasury from "./treasury";
import { PageHero } from "@/components/PageHero";
import { BrandButton } from "@/components/BrandButton";
import { Badge } from "@/components/Badge";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export default function PrivyPage() {
  if (!APP_ID) return <SetupNotice />;
  return <Treasury />;
}

function SetupNotice() {
  return (
    <div>
      <PageHero
        title="Treasury"
        eyebrow="Setup Required"
        subtitle="Sign-in and the embedded wallet need a Privy App ID. The rest of the site still works."
        image="/images/river-moon.jpg"
      />
      <section className="mx-auto max-w-[880px] px-4 py-12 sm:px-6">
        <div className="border border-border bg-bg-elevated p-8">
          <Badge tone="warn">Privy Setup Required</Badge>
          <h2 className="mt-4 font-display text-2xl font-medium text-ink">
            Embedded Wallet Configuration
          </h2>
          <p className="mt-3 font-display text-base leading-relaxed text-fg-body">
            Sign-in and embedded self-custodial wallet features require a Privy App ID.
          </p>
          <ol className="mt-6 space-y-3 font-display text-base text-fg-body list-decimal list-inside">
            <li>
              Create an app at <code className="font-label text-sm text-ink bg-bg p-1 border border-border">dashboard.privy.io</code>.
            </li>
            <li>
              Copy <code className="font-label text-sm text-ink bg-bg p-1 border border-border">.env.example</code> → <code className="font-label text-sm text-ink bg-bg p-1 border border-border">.env.local</code> and set <code className="font-label text-sm text-ink bg-bg p-1 border border-border">NEXT_PUBLIC_PRIVY_APP_ID</code>, then restart.
            </li>
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <BrandButton href="/">← Back to varanasi</BrandButton>
            <BrandButton href="https://github.com/Ramprasad4121/varanasi/blob/main/frontend/PRIVY.md" variant="ghost">
              Read docs ↗
            </BrandButton>
          </div>
        </div>
      </section>
    </div>
  );
}
