"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/Badge";
import { BrandButton } from "@/components/BrandButton";
import { PageHero } from "@/components/PageHero";
import { SectionSep } from "@/components/SectionSep";
import { demoFinance, fmt, pct, recommendFrom, type FinanceSnapshot } from "@/components/finance/demo";
import type { FinancialRecommendation } from "@/finance-types";
import { VUSD, shortAddr } from "@/lib/site";

const DEMO_ADDR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export default function FinancePage() {
  const [address, setAddress] = useState(DEMO_ADDR);
  const [input, setInput] = useState(DEMO_ADDR);
  const [done, setDone] = useState<string[]>([]);

  const snapshot = useMemo<FinanceSnapshot>(
    () => demoFinance(address.toLowerCase() as `0x${string}`),
    [address],
  );
  const recommendations = useMemo(
    () => recommendFrom(snapshot, address.toLowerCase() as `0x${string}`),
    [snapshot, address],
  );

  const markDone = (action: string) => setDone((d) => [...d, action]);

  return (
    <div>
      <PageHero
        title="Financial vault"
        eyebrow="Community Finance"
        subtitle="Savings, chit funds, term loans, and gold-backed collateral — a programmable treasury your agent can steward. All figures below are simulated demo state."
        image="/images/scales.jpg"
      />
      <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-[34rem]">
            <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">Vault for</p>
            <p className="mt-1 font-display text-lg truncate text-ink" title={address}>
              {address === DEMO_ADDR.toLowerCase() ? "Demo wallet" : address}
            </p>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (/^0x[0-9a-fA-F]{40}$/.test(input)) setAddress(input);
            }}
          >
            <input
              className="h-12 border border-border bg-bg px-4 font-label text-sm text-ink outline-none focus:border-ink"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="0x… wallet address"
              spellCheck={false}
              aria-label="Wallet address"
            />
            <BrandButton type="submit" variant="quiet">Load</BrandButton>
          </form>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Savings vault" tone="ok">
            <Row label="Status" value={snapshot.savings.open ? "Open" : "Closed"} />
            <Row label="Balance" value={fmt(snapshot.savings.balance)} />
            <Row label="Deposited" value={fmt(snapshot.savings.deposited)} />
            <Row label="Recurring" value="Keeper-scheduled demo rule" />
            {!done.includes("deposit_savings") && (<DepositAction snapshot={snapshot} onDone={() => markDone("deposit_savings")} />)}
            {done.includes("deposit_savings") && <DoneNote text="Deposit executed (simulated)" />}
          </Card>

          <Card title="Chit fund" tone="neutral">
            <Row label="Round" value={`${snapshot.chit.settledRounds.toString()}/12 settled`} />
            <Row label="Contribution" value={fmt(snapshot.chit.config.contributionAmount)} />
            <Row label="Members" value={snapshot.chit.members.length.toString()} />
            <Row label="Next deadline" value="In ~6 days" />
            <ActionButton
              label="Demo contribute"
              note={`Pay ${fmt(snapshot.chit.config.contributionAmount)}`}
              onClick={() => markDone("contribute_chit")}
            />
            {done.includes("contribute_chit") && <DoneNote text="Contribution submitted (simulated)" />}
          </Card>

          <Card title="Gold-backed collateral" tone="neutral">
            <Row label="Bar" value={`${snapshot.gold.grams.toString()}g · ${pct(snapshot.gold.finenessBps)}`} />
            <Row label="Keeper" value={snapshot.gold.custodianName} />
            <Row label="Status" value={snapshot.gold.status} />
            <Row label="Collateral" value={fmt(snapshot.collateral.amount)} />
            {done.includes("redeem_gold") && <DoneNote text="Gold settled (simulated)" />}
          </Card>
        </div>

        <SectionSep />
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-8">
            <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">Agent read</p>
            <h2 className="mt-2 font-display text-3xl font-medium tracking-[-0.03em] text-ink">
              What your steward recommends
            </h2>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2">
            {recommendations.map((r, i) => (
              <RecommendationCard key={`${r.action}:${i}`} rec={r} done={done} onAct={markDone} />
            ))}
          </ol>
        </div>

        <SectionSep />
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">Onchain roots</p>
            <Link
              href={`https://sepolia.etherscan.io/address/${VUSD}`}
              target="_blank"
              rel="noreferrer"
              className="font-label text-sm text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
            >
              vUSD {shortAddr(VUSD)}
            </Link>
          </div>
          <div className="border border-border bg-bg-elevated p-6">
            <p className="font-display text-[16px] italic leading-relaxed text-fg-body">
              Demo vault. No real funds move — the savings vault, chit fund, loan, and gold collateral
              contracts are the source of truth once live on Sepolia. The agent recommends; you sign;
              nothing broadcasts without your wallet.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Card({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "ok" | "neutral" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border border-border bg-bg-elevated p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl font-medium tracking-[-0.02em] text-ink">{title}</h3>
        <Badge tone={tone === "ok" ? "ok" : tone === "warn" ? "warn" : "neutral"}>
          Demo
        </Badge>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2">
      <span className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">{label}</span>
      <span className="font-display text-base text-ink">{value}</span>
    </div>
  );
}

function ActionButton({
  label,
  note,
  onClick,
}: {
  label: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <div className="mt-2 flex flex-col gap-1">
      <BrandButton variant="quiet" onClick={onClick}>{label}</BrandButton>
      <p className="font-label text-[10px] uppercase tracking-[0.12em] text-fg-muted">{note}</p>
    </div>
  );
}

function DoneNote({ text }: { text: string }) {
  return (
    <p className="mt-2 font-label text-[11px] uppercase tracking-[0.12em] text-ok">{text}</p>
  );
}

function DepositAction({ snapshot, onDone }: { snapshot: FinanceSnapshot; onDone: () => void }) {
  const floor = BigInt(1_000) * BigInt(10) ** BigInt(18);
  if (snapshot.savings.balance >= floor) return null;
  return (
    <ActionButton
      label="Demo deposit"
      note={`Top up ${fmt(floor - snapshot.savings.balance)}`}
      onClick={onDone}
    />
  );
}

function RecommendationCard({
  rec,
  done,
  onAct,
}: {
  rec: FinancialRecommendation;
  done: string[];
  onAct: (a: string) => void;
}) {
  const tone = rec.riskLevel === "high" ? "bad" : rec.riskLevel === "medium" ? "warn" : "ok";
  return (
    <li className="flex flex-col gap-3 border border-border bg-bg-elevated p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="font-label text-[11px] uppercase tracking-[0.16em] text-ink">{rec.action.replace(/_/g, " ")}</p>
        <Badge tone={tone}>{rec.riskLevel}</Badge>
      </div>
      <p className="font-display text-[15px] leading-relaxed text-fg-body">{rec.rationale}</p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="font-label text-[11px] uppercase tracking-[0.12em] text-fg-muted">
          {rec.estimatedCost > BigInt(0) ? `~${fmt(rec.estimatedCost)}` : "No capital cost"}
        </span>
        {rec.action !== "no_action" &&
          (done.includes(rec.action) ? (
            <DoneNote text="Done — simulated" />
          ) : (
            <BrandButton variant="ghost" onClick={() => onAct(rec.action)}>Authorize</BrandButton>
          ))}
      </div>
    </li>
  );
}