// Author: Ramprasad — the Varanasi legion: curated agent archetypes with
// Greek-soldier plate art params. The three `live` entries mirror AGENTS in
// lib/site.ts (keep in sync). Archetypes are honest mandate templates, not
// onchain claims — deployment status is explicit.

export type SoldierTone = "accent" | "leaf" | "ink" | "amber";
export type SoldierHelm = "corinthian" | "pilos" | "attican";
export type SoldierWeapon = "spear" | "sword" | "torch" | "scales" | "banner" | "bow";
export type SoldierPose = "guard" | "scout" | "judge" | "scribe";

export type Legionnaire = {
  id: string;
  ens: string;
  name: string;
  role: string;
  summary: string;
  specialties: string[];
  cap: string;
  window: string;
  expiry: string;
  live: boolean;
  soldier: {
    helm: SoldierHelm;
    weapon: SoldierWeapon;
    pose: SoldierPose;
    tone: SoldierTone;
    emblem: string;
  };
};

export const SPECIALTIES = [
  "markets",
  "risk",
  "settlement",
  "identity",
  "execution",
  "evidence",
  "payments",
  "attestations",
  "matching",
  "writing",
  "feeds",
  "discovery",
  "verdicts",
  "escrow",
  "access",
  "swaps",
  "delivery",
  "validation",
  "intents",
  "mandates",
  "data",
  "x402",
] as const;

export const LEGION: Legionnaire[] = [
  {
    id: "scout",
    ens: "scout.aegis.eth",
    name: "Scout",
    role: "Finds pools",
    summary: "Scans live Uniswap markets, scores liquidity, and returns a shortlist inside your window.",
    specialties: ["markets", "discovery"],
    cap: "10",
    window: "24",
    expiry: "7",
    live: true,
    soldier: { helm: "pilos", weapon: "spear", pose: "scout", tone: "accent", emblem: "Σ" },
  },
  {
    id: "analyst",
    ens: "analyst.aegis.eth",
    name: "Analyst",
    role: "Scores risk",
    summary: "Reasons over TVL, volume, and alpha. Emits an ACT or SKIP verdict the escrow can enforce.",
    specialties: ["risk", "verdicts"],
    cap: "25",
    window: "12",
    expiry: "7",
    live: true,
    soldier: { helm: "corinthian", weapon: "scales", pose: "judge", tone: "leaf", emblem: "Λ" },
  },
  {
    id: "freelancer",
    ens: "freelancer.aegis.eth",
    name: "Freelancer",
    role: "Settles escrow",
    summary: "Carries the mandate to fund, validate, and release. Miss the bar and you are refunded with evidence.",
    specialties: ["settlement", "escrow", "identity"],
    cap: "50",
    window: "48",
    expiry: "14",
    live: true,
    soldier: { helm: "attican", weapon: "banner", pose: "guard", tone: "ink", emblem: "Α" },
  },
  {
    id: "sentry",
    ens: "sentry.aegis.eth",
    name: "Sentry",
    role: "Guards the gate",
    summary: "Watches identity and access — checks authorizations live at settlement, blocks revoked or expired keys.",
    specialties: ["identity", "access"],
    cap: "5",
    window: "6",
    expiry: "30",
    live: false,
    soldier: { helm: "corinthian", weapon: "torch", pose: "guard", tone: "amber", emblem: "Φ" },
  },
  {
    id: "trader",
    ens: "trader.aegis.eth",
    name: "Trader",
    role: "Executes swaps",
    summary: "Runs swaps inside a locked cap on the rail. Every fill is routed through escrow — no standing allowance, ever.",
    specialties: ["execution", "swaps", "markets"],
    cap: "100",
    window: "12",
    expiry: "3",
    live: false,
    soldier: { helm: "pilos", weapon: "spear", pose: "guard", tone: "accent", emblem: "Τ" },
  },
  {
    id: "liquidator",
    ens: "liquidator.aegis.eth",
    name: "Liquidator",
    role: "Clears bad books",
    summary: "Monitors positions crossing safety thresholds and unwinds them within a bounded mandate, refunds included.",
    specialties: ["risk", "settlement"],
    cap: "40",
    window: "24",
    expiry: "2",
    live: false,
    soldier: { helm: "attican", weapon: "sword", pose: "guard", tone: "leaf", emblem: "Θ" },
  },
  {
    id: "historian",
    ens: "historian.aegis.eth",
    name: "Historian",
    role: "Writes the ledger",
    summary: "Turns receipts, verdicts, and settle events into enduring onchain records anyone can audit.",
    specialties: ["evidence", "writing"],
    cap: "15",
    window: "48",
    expiry: "30",
    live: false,
    soldier: { helm: "pilos", weapon: "banner", pose: "scribe", tone: "ink", emblem: "Η" },
  },
  {
    id: "courier",
    ens: "courier.aegis.eth",
    name: "Courier",
    role: "Runs x402",
    summary: "Carries payments over the x402 rail — pays the merchant only when proof clears, with a receipt onchain.",
    specialties: ["payments", "x402", "delivery"],
    cap: "30",
    window: "12",
    expiry: "7",
    live: false,
    soldier: { helm: "pilos", weapon: "banner", pose: "scout", tone: "accent", emblem: "Κ" },
  },
  {
    id: "auditor",
    ens: "auditor.aegis.eth",
    name: "Auditor",
    role: "Attests claims",
    summary: "Validates claimed work against the mandate bar and signs an attestation the escrow can trust.",
    specialties: ["attestations", "validation"],
    cap: "20",
    window: "36",
    expiry: "14",
    live: false,
    soldier: { helm: "corinthian", weapon: "scales", pose: "judge", tone: "leaf", emblem: "Ψ" },
  },
  {
    id: "broker",
    ens: "broker.aegis.eth",
    name: "Broker",
    role: "Matches intents",
    summary: "Pairs a coin you hold with a job the legion can do — a shortlist of mandates pre-scoped to your budget.",
    specialties: ["matching", "intents", "markets"],
    cap: "10",
    window: "6",
    expiry: "7",
    live: false,
    soldier: { helm: "attican", weapon: "torch", pose: "judge", tone: "amber", emblem: "Β" },
  },
  {
    id: "scribe",
    ens: "scribe.aegis.eth",
    name: "Scribe",
    role: "Drafts mandates",
    summary: "Turns a loose ask into a crisp, enforceable mandate — cap, window, bar, refund terms — before any funds move.",
    specialties: ["writing", "mandates"],
    cap: "5",
    window: "6",
    expiry: "3",
    live: false,
    soldier: { helm: "pilos", weapon: "spear", pose: "scribe", tone: "ink", emblem: "Ξ" },
  },
  {
    id: "oracle",
    ens: "oracle.aegis.eth",
    name: "Oracle",
    role: "Streams truth",
    summary: "Feeds live onchain and market data into verdicts, so settlement reasons over facts, not screenshots.",
    specialties: ["feeds", "data", "attestations"],
    cap: "10",
    window: "12",
    expiry: "30",
    live: false,
    soldier: { helm: "attican", weapon: "torch", pose: "scribe", tone: "amber", emblem: "Ω" },
  },
];

export function legionById(id: string): Legionnaire | undefined {
  return LEGION.find((a) => a.id === id);
}

export function liveLegion(): Legionnaire[] {
  return LEGION.filter((a) => a.live);
}

export function archetypes(): Legionnaire[] {
  return LEGION.filter((a) => !a.live);
}