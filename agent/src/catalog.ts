/**
 * @author Ramprasad — live agent roster. Source of truth: ../../catalog/agents.json
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export type CatalogFile = {
  version: number;
  chain: string;
  chainId: number;
  registry: string;
  escrow: string;
  riskGuard: string;
  vusd: string;
  agents: CatalogAgent[];
};

function loadCatalog(): CatalogFile {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../catalog/agents.json"),
    resolve(process.cwd(), "../catalog/agents.json"),
    resolve(process.cwd(), "catalog/agents.json"),
  ];
  for (const path of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as CatalogFile;
      if (Array.isArray(parsed.agents) && parsed.agents.length > 0) return parsed;
    } catch {
      /* next */
    }
  }
  throw new Error("catalog/agents.json not found");
}

export const CATALOG: CatalogFile = loadCatalog();
export const AGENTS: CatalogAgent[] = CATALOG.agents;
export const AGENT_IDS: string[] = AGENTS.map((a) => a.id);

export function agentById(id: string): CatalogAgent | undefined {
  const key = id.trim().toLowerCase().replace(/\.aegis\.eth$/, "");
  return AGENTS.find((a) => a.id === key || a.ens === id || a.name.toLowerCase() === key);
}

export function requireAgent(id: string): CatalogAgent {
  const found = agentById(id);
  if (!found) throw new Error(`Unknown agent "${id}". Live roster: ${AGENT_IDS.join(", ")}`);
  return found;
}
