import { AGENTS, agentById as findAgent, type CatalogAgent } from "./agents";

export type Legionnaire = CatalogAgent & { live: true };

export const SPECIALTIES = [
  "markets","risk","settlement","identity","evidence","attestations","discovery",
  "verdicts","escrow","access","data","feeds","intents","mandates","writing","validation",
] as const;

export const LEGION: Legionnaire[] = AGENTS.map((a) => ({ ...a, live: true as const }));
export function legionById(id: string): Legionnaire | undefined {
  const found = findAgent(id);
  return found ? { ...found, live: true } : undefined;
}
export function liveLegion(): Legionnaire[] { return LEGION; }
export function archetypes(): Legionnaire[] { return []; }
