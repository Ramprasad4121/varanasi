"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { BrandButton } from "@/components/BrandButton";
import { PageHero } from "@/components/PageHero";

type Tier = "verified" | "guest";

const POLICY: Record<Tier, { maxAgents: number; allowance: string; label: string }> = {
  verified: { maxAgents: 10, allowance: "50%", label: "Verified human" },
  guest: { maxAgents: 1, allowance: "5%", label: "Guest" },
};

const LS_NULLIFIER = "aegis.humanNullifier";
const LS_TIER = "aegis.humanTier";

export default function HumanPage() {
  const [tier, setTier] = useState<Tier | null>(null);
  const [nullifier, setNullifier] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    try {
      const savedTier = localStorage.getItem(LS_TIER) as Tier | null;
      const savedNullifier = localStorage.getItem(LS_NULLIFIER);
      if (savedTier && POLICY[savedTier]) {
        setTier(savedTier);
        setNullifier(savedNullifier);
      }
    } catch {
      // ignore
    }
  }, []);

  function apply(next: Tier, n: string | null, via: string) {
    setTier(next);
    setNullifier(n);
    setNote(via);
    try {
      localStorage.setItem(LS_TIER, next);
      if (n) {
        localStorage.setItem(LS_NULLIFIER, n);
      } else {
        localStorage.removeItem(LS_NULLIFIER);
      }
    } catch {
      // ignore
    }
  }

  const policy = tier ? POLICY[tier] : null;

  return (
    <div>
      <PageHero
        title="Verify humanity"
        eyebrow="Human Verification"
        subtitle="One verified human can run more agents at a higher allowance. Guests stay capped. This stops one person minting an army."
        image="/images/scales.jpg"
      />
      <section className="mx-auto max-w-[680px] px-4 py-12 sm:px-6">
        <p className="font-display text-lg leading-relaxed text-fg-body">
          Verified: up to {POLICY.verified.maxAgents} agents at {POLICY.verified.allowance} allowance. Guests:{" "}
          {POLICY.guest.maxAgents} agent at {POLICY.guest.allowance}.
        </p>

        {tier === null ? (
          <div className="mt-8 flex flex-wrap gap-3">
            <BrandButton
              onClick={() =>
                apply(
                  "verified",
                  `sandbox-${Math.random().toString(16).slice(2, 10)}`,
                  "Sandbox test credential — clearly labelled, not a live World ID proof."
                )
              }
            >
              Verify with World ID
            </BrandButton>
            <BrandButton
              variant="ghost"
              onClick={() => apply("guest", null, "Continuing as guest — 1 agent, 5% allowance.")}
            >
              Continue as guest
            </BrandButton>
          </div>
        ) : null}

        {tier && policy ? (
          <div className="mt-8 border border-border bg-bg-elevated p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tier === "verified" ? "ok" : "warn"}>{policy.label}</Badge>
              {tier === "verified" ? <Badge tone="warn">test credential</Badge> : null}
            </div>
            <p className="mt-4 font-display text-lg text-ink">
              Max agents <strong>{policy.maxAgents}</strong> · max allowance <strong>{policy.allowance}</strong>
            </p>
            {nullifier ? (
              <p className="mt-2 font-label text-xs text-fg-muted">nullifier {nullifier}</p>
            ) : null}
            {tier === "guest" ? (
              <p className="mt-3 font-display text-sm italic text-fg-muted">
                Guest mode is capped on purpose. Verify to unlock higher limits.
              </p>
            ) : (
              <p className="mt-3 font-display text-sm italic text-fg-muted">
                This preview issues a sandbox credential so you can try the limits. Live World ID verification needs the
                backend verifier.
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <BrandButton
                variant="ghost"
                onClick={() => {
                  setTier(null);
                  setNullifier(null);
                  setNote("");
                  try {
                    localStorage.removeItem(LS_TIER);
                    localStorage.removeItem(LS_NULLIFIER);
                  } catch {}
                }}
              >
                Reset
              </BrandButton>
              <BrandButton href="/hire" variant="quiet">
                Hire an agent
              </BrandButton>
            </div>
          </div>
        ) : null}

        {note ? <p className="mt-4 font-label text-xs text-fg-muted">{note}</p> : null}
      </section>
    </div>
  );
}
