import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  input: { name: string; label: string; placeholder: string; required: boolean }[];
  image: string;
  demoWallet: string;
};

function load() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../catalog/agents.json'),
    resolve(process.cwd(), '../catalog/agents.json'),
    resolve(process.cwd(), 'catalog/agents.json'),
  ];
  for (const path of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { agents: CatalogAgent[] };
      if (parsed.agents?.length) return parsed;
    } catch { /* next */ }
  }
  throw new Error('catalog/agents.json not found');
}

export const CATALOG = load();
export const AGENTS = CATALOG.agents;
export function agentById(id: string): CatalogAgent | undefined {
  const key = id.trim().toLowerCase().replace(/\.aegis\.eth$/, '');
  return AGENTS.find((a) => a.id === key || a.ens === id);
}
