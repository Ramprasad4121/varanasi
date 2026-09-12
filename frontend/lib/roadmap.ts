// Author: Ramprasad — the Varanasi roadmap: 23 bricks, no dates.
// Brick 01 is shipped. Bricks 02-23 are planned. Text is the canonical
// ordering statement; the /roadmap page renders it verbatim.

export type Brick = {
  n: string;
  title: string;
  status: "shipped" | "planned";
  body: string[];
};

export const ROADMAP_INTRO = [
  "This roadmap has no dates on it. A small team building on frontier AI tools can ship what used to take years in weeks — execution speed was never the real constraint. What matters is what we build, in what order, and whether each piece can be trusted before the next one gets built on top of it. So here's the order. Every brick has to hold before we lay the next one.",
];

export const ROADMAP_OUTRO = [
  "Every financial system that's ever existed was built for people who could be held accountable after the fact — a bad check bounces, a fraud gets sued, a company gets audited. Agents don't get an \"after the fact.\" By the time you notice one moved your money wrong, it's already gone. So the accountability has to move to before the money does — whether that money is being paid to someone, saved, lent, or locked up as collateral.",
  "That's what Varanasi is: the rail that checks first, for everything an autonomous economic actor does with money, not just the part where it pays someone. Every agent, DAO, and business that will ever manage real capital on its own eventually needs one. We're building it now, while it's still small enough to build right.",
];

export const BRICKS: Brick[] = [
  {
    n: "01",
    title: "The Enforcement Rail",
    status: "shipped",
    body: [
      "A human signs a mandate: a cap, a window, an expiry, a nonce. Funds lock in escrow, not in the agent's wallet. The agent works inside those bounds — replay is impossible, because the nonce burns the moment it's used. Release only fires when the work clears the bar; miss it, and the human is refunded, with the evidence on-chain. One click kills the agent's identity everywhere it was ever used.",
      "This isn't a plan we're describing — it's live. Escrows have released. Payments have settled. Agent identities exist. The full test suite is green. Proof, not a promise.",
    ],
  },
  {
    n: "02",
    title: "Trustless Verification",
    status: "planned",
    body: [
      "Right now, one allowlisted validator decides whether an agent's work clears the bar. That's a trust assumption, and we don't like trust assumptions in a system built to remove them. We're replacing the single validator with a quorum of independent verdict nodes — each one scores the work confidentially, and release only fires once enough of them agree. The work gets checked. It never gets leaked. No single party gets to be the judge alone again.",
    ],
  },
  {
    n: "03",
    title: "Agents That Hire Agents",
    status: "planned",
    body: [
      "A human hiring one agent is the smallest unit of agentic commerce, not the whole of it. Real work happens when an agent hires other agents to handle pieces of a task. We're turning a mandate into a tree: a parent mandate can issue child mandates, and the contract — not a policy document, not a prompt — enforces that a child's cap, window, and expiry can never exceed its parent's. Proof rolls up the tree before the top mandate ever releases. This is what turns one hire into a whole multi-agent workforce, without a single one of them ever holding a key that outlives its purpose.",
    ],
  },
  {
    n: "04",
    title: "Reputation Leaves the Building",
    status: "planned",
    body: [
      "Every settled payment is evidence. Right now, that evidence lives inside Varanasi's own marketplace. We're opening it as a public reputation graph any agent platform can query, so an agent's track record isn't trapped where it was earned. Reputation becomes portable, the way a credit history is portable — except every entry is a cryptographic settlement, not someone's word.",
    ],
  },
  {
    n: "05",
    title: "Trust Becomes Capital",
    status: "planned",
    body: [
      "Once reputation is real and portable, it's worth something. Agents with enough settled history need less capital locked up to operate — their track record covers part of the escrow. New agents with no history yet still get funded fast: a third party can underwrite them, staking capital against their good behavior in exchange for a cut of their fees, and losing that stake the moment the agent breaks its mandate. Trust stops being something you wait years to accumulate. It becomes something you can build, borrow, or stake.",
    ],
  },
  {
    n: "06",
    title: "One Rail, Any Chain",
    status: "planned",
    body: [
      "The contracts are already written so the move from testnet to mainnet changes the network, not the code. The mandate spec itself is chain-agnostic by design. Wherever agents end up moving money, this rail is already there waiting for them.",
    ],
  },
  {
    n: "07",
    title: "The Treasury",
    status: "planned",
    body: [
      "Every principal on Varanasi — agent, human, DAO, business — gets a treasury, not just a wallet: a balance, what's reserved, what's available, and a policy governing it. Keep $1,000 liquid. Never put more than $200 into one strategy. Never borrow past $500. The treasury doesn't decide anything. It's Brick 01's mandate logic, applied to standing rules instead of a single payment.",
    ],
  },
  {
    n: "08",
    title: "Decisions Without Authority",
    status: "planned",
    body: [
      "An agent can ask its treasury a question — what's available, what's approved, what a given move would cost against policy — and get facts back. It cannot ask Varanasi what it should do and get an answer, because the moment we start recommending, we've become the decision-maker, and the whole point of this protocol is that the decision-maker and the enforcer are never the same party. AI decides. Varanasi enforces. That line doesn't move.",
    ],
  },
  {
    n: "09",
    title: "Routing, Not Owning",
    status: "planned",
    body: [
      "When a treasury wants to put idle capital to work, Varanasi doesn't hold it and doesn't farm yield with it. It checks the move against policy, then routes it to an already-audited external protocol built for exactly that job. We are not building our own lending market. The industry doesn't need another one, and a bug in ours would be catastrophic in a way a bug in a protocol that's survived years of adversarial testing isn't.",
    ],
  },
  {
    n: "10",
    title: "Loans, the Way We Already Trust Them",
    status: "planned",
    body: [
      "A loan is a bilateral mandate: principal, interest, schedule, collateral, and a counterparty who signed on to all of it. Repayment and default get enforced the same way a hire gets enforced — escrow, proof, settlement. This is the first new financial primitive we build, because it's really just Brick 01 with different fields, not a new kind of business.",
    ],
  },
  {
    n: "11",
    title: "One Vault for Anything Locked",
    status: "planned",
    body: [
      "Loans need collateral. So will other things eventually. Instead of a bespoke lock-up mechanism per feature, one audited collateral vault that anything can call against. Every new primitive that needs to lock value uses the same vault, the same invariants, the same audit — not a new attack surface each time.",
    ],
  },
  {
    n: "12",
    title: "Real-World Assets, Without Pretending to Be a Bank",
    status: "planned",
    body: [
      "If collateral ever extends to something like gold, Varanasi does not become its own custodian or its own attestor. That's a different, regulated business, and no amount of good code changes that. We plug into an existing, audited proof-of-reserve system instead of inventing our own — the same category of infrastructure that's already prevented real blowups elsewhere, not a homemade version of it.",
    ],
  },
  {
    n: "13",
    title: "Pooled Finance, Not Chits",
    status: "planned",
    body: [
      "A community pool where strangers contribute and trust each other to keep contributing only works when defaulting costs you something real — in a village, that's your standing with people you'll face again tomorrow. A wallet has no face and no tomorrow it's afraid of. So pooled finance here means collateral-backed or reputation-gated, always, from the first version. Not open credit among anonymous participants.",
    ],
  },
  {
    n: "14",
    title: "A Score That Remembers More Than Payments",
    status: "planned",
    body: [
      "The reputation graph from Brick 04 grows up: repayment history, contribution consistency, default rate, all feeding the same score a settled payment already feeds. One number that gets more honest over time, not a separate scorecard for every product.",
    ],
  },
  {
    n: "15",
    title: "The Treasury Writes the Rules",
    status: "planned",
    body: [
      "Hiring an agent, issuing a sub-mandate, entering a loan — all three now check against the same treasury policy automatically, instead of each carrying its own separate limit. Brick 03, Brick 07, and Brick 10 stop being three features and start being three doors into the same room.",
    ],
  },
  {
    n: "16",
    title: "The Same Rail for Anyone Who Has Money to Manage",
    status: "planned",
    body: [
      "The enforcement layer stops being agent-specific. A DAO treasury, a small business, a human with a savings goal — same policy engine, same mandates, same proof and settlement. An agent proposing an allocation and a DAO's own multisig proposing one look identical to the contract. It doesn't know or care which one is a person.",
    ],
  },
  {
    n: "17",
    title: "A Market for Trust",
    status: "planned",
    body: [
      "Brick 05's idea — reputation offsetting collateral — grows into an actual market. A third party can underwrite a specific agent or a specific loan, staking capital against its good behavior for a cut of the fees, and losing that stake the moment the mandate breaks. Trust gets priced by whoever's willing to back it, not by one internal risk score we made up.",
    ],
  },
  {
    n: "18",
    title: "Credit That Travels",
    status: "planned",
    body: [
      "An agent's history, built entirely on Varanasi, becomes something other lending protocols can query when deciding whether to extend it credit. Reputation stops being a wall around our own marketplace and starts being an export.",
    ],
  },
  {
    n: "19",
    title: "What a Regulator Would Actually Need",
    status: "planned",
    body: [
      "Once real value moves through real financial primitives, we expose what an auditor, a regulator, or an institutional counterparty actually asks for — attestations, audit trails, reporting hooks — without pretending to be a bank we're not. Built once there's real volume worth regulating. Not before, because compliance surfaces for a system with no users are just decoration.",
    ],
  },
  {
    n: "20",
    title: "The Version an Institution Can Run",
    status: "planned",
    body: [
      "Once the agent-developer version is proven, the same primitives get packaged for an institution running its own AI agents inside a treasury it fully controls — a business or a DAO operating entirely on mandates it wrote itself, with us as the enforcement layer underneath, not the counterparty.",
    ],
  },
  {
    n: "21",
    title: "The Standard, Widened",
    status: "planned",
    body: [
      "The mandate spec from Brick 06 grows to cover treasury policy, not just single payments — and gets proposed the same way, as something other protocols implement directly. Policy-bound autonomous capital becomes a property of the ecosystem other people build on, not a feature only we have.",
    ],
  },
  {
    n: "22",
    title: "No Single Point of Anything",
    status: "planned",
    body: [
      "No verifier, no routed protocol, no attestation source that Varanasi depends on is the only one. Multiple verdict nodes from Brick 02, multiple external protocols from Brick 09, multiple attestation sources from Brick 12 — so no single partner going down takes the rail with it.",
    ],
  },
  {
    n: "23",
    title: "One Loop, Every Kind of Money",
    status: "planned",
    body: [
      "By now a hire, a loan, a savings deposit, and a collateral position aren't different products with different code paths. They're the same loop — earn, decide, enforce, execute, prove, settle, remember — running against a different kind of financial action each time. That's the point where Varanasi stops being a list of features and becomes a platform.",
    ],
  },
];
