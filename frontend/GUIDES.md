# Guides checklist — every feature ships with a plain-words guide

Author: Ramprasad

A feature is not done until a new user can use it without stress.
Each working page carries the same 3-part pattern at the top:

1. **What this is** — one sentence, no protocol words.
2. **Do this** — numbered steps, max 3.
3. **If it goes wrong** — the refund / revoke / fallback path.

## Feature → guide location

| Feature | Page | Guide lives |
|---|---|---|
| Hire an agent | `/hire` | Wizard steps 1-4 inline + `/docs#guides` |
| Verify humanity | `/human` | Tier explainer inline + `/docs#guides` |
| Agent roster + pet | `/agents` | Persona strip + onboard steps + `/docs#guides` |
| Human vs agent start | `/start` | Two-track cards inline |
| Activity ledger | `/activity` | Page subtitle + `/docs#guides` |
| Profile + vault | `/account` | Per-card explainers + `/docs#guides` |
| Treasury | `/privy` | Numbered panels 1-3 inline + `/docs#guides` |
| Mandate shape | `/docs#mandate` | HOW steps + field table |
| Proof | `/docs#proof` | Records + contracts lists |
| Roadmap | `/roadmap` | Exempt — direction doc, not a feature |
| Finance / Gold coin | `/finance`, `/gold` | Coming Soon shell (guides land when the feature does) |

## Copy rules for all guides

- No chain names, no testnet, no author/license in user-visible text.
- Explorer links keep working; labels say "Open record" / "View transaction".
- Reading level: plain words. If a sentence needs a glossary entry, rewrite it.
