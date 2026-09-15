import catalog from "./agents.catalog.json";

export type AgentInputField = {
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
};

export type CatalogAgent = {
  id: string;
  ens: string;
  name: string;
  role: string;
  summary: string;
  does: string;
  specialties: string[];
  cap: string;
  window: string;
  expiry: string;
  bar: string;
  input: AgentInputField[];
  image: string;
  demoWallet: string;
};

export const CATALOG = catalog;
export const AGENTS: CatalogAgent[] = catalog.agents as CatalogAgent[];

export function agentById(id: string | null | undefined): CatalogAgent | undefined {
  if (!id) return undefined;
  const key = id.trim().toLowerCase().replace(/\.aegis\.eth$/, "");
  return AGENTS.find((a) => a.id === key || a.ens.toLowerCase() === id.toLowerCase() || a.name.toLowerCase() === key);
}

export function liveAgents(): CatalogAgent[] {
  return AGENTS;
}
