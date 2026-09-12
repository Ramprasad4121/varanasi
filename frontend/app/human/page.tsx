"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { BrandButton } from "@/components/BrandButton";
import { PageHero } from "@/components/PageHero";
import { useVaultUserId, loadScoped, saveScoped, removeScoped } from "@/lib/vault";

type Tier = "verified" | "guest";

const POLICY: Record<Tier, { maxAgents: number; allowance: string; label: string }> = {
  verified: { maxAgents: 10, allowance: "50%", label: "Verified human" },
  guest: { maxAgents: 1, allowance: "5%", label: "Guest" },
};

// Scoped to the signed-in account (lib/vault): one browser, many users — no bleed.
const LS_HUMAN = "aegis.humanProof";
const LEGACY_NULLIFIER = "aegis.humanNullifier";
const LEGACY_TIER = "aegis.humanTier";

type HumanProof = { tier: Tier | null; nullifier: string | null };

export default function HumanPage() {
  const userId = useVaultUserId();
  const [tier, setTier] = useState<Tier | null>(null);
  const [nullifier, setNullifier] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const stored = loadScoped<HumanProof | null>(userId, LS_HUMAN, null);
    if (stored) {
      if (stored.tier && POLICY[stored.tier]) {
        setTier(stored.tier);
        setNullifier(stored.nullifier ?? null);
      }
      return;
    }
    // One-time migration from the pre-scoping shared keys, then clear them.
    try {
      const rawTier = localStorage.getItem(LEGACY_TIER) as Tier | null;
      if (rawTier && POLICY[rawTier]) {
        const rawNullifier = localStorage.getItem(LEGACY_NULLIFIER);
        setTier(rawTier);
        setNullifier(rawNullifier);
        saveScoped(userId, LS_HUMAN, { tier: rawTier, nullifier: rawNullifier });
      }
      localStorage.removeItem(LEGACY_TIER);
      localStorage.removeItem(LEGACY_NULLIFIER);
    } catch {
      // ignore
    }
  }, [userId]);

  function apply(next: Tier, n: string | null, via: string) {
    setTier(next);
    setNullifier(n);
    setNote(via);
    saveScoped(userId, LS_HUMAN, { tier: next, nullifier: n });
  }

  const policy = tier ? POLICY[tier] : null;

  return (
    <div>
      <PageHero
        title="Verify humanity"
        eyebrow="Human Verification"
        subtitle="One verified human can run more agents at a higher allowance. Guests stay capped. This stops one person minting an army."
        plate="scales"
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
                  removeScoped(userId, LS_HUMAN);
                  try {
                    localStorage.removeItem(LEGACY_TIER);
                    localStorage.removeItem(LEGACY_NULLIFIER);
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
