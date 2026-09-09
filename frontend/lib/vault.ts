"use client";

// Author: Ramprasad — per-user vault. Keys never stored. Guest data migrates on first sign-in.
import { usePrivy } from "@privy-io/react-auth";
import { load, save } from "../components/aegis";

export const HAS_PRIVY = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
export const LS_TASKS = "aegis.tasks";

export type HireRecord = {
  id: string;
  agent: string;
  cap: string;
  status: string;
  fundTx?: string;
  at: string;
};

export function scopeKey(userId: string | undefined, base: string) {
  return userId ? `varanasi.${userId}.${base}` : base;
}

function loadMaybe<T>(key: string): T | undefined {
  try {
    if (typeof localStorage === "undefined") return undefined;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function loadScoped<T>(userId: string | undefined, base: string, fallback: T): T {
  if (userId) {
    const own = loadMaybe<T>(scopeKey(userId, base));
    if (own !== undefined) return own;
    const guest = loadMaybe<T>(base);
    if (guest !== undefined) {
      save(scopeKey(userId, base), guest);
      return guest;
    }
    return fallback;
  }
  return load<T>(base, fallback);
}

export function saveScoped(userId: string | undefined, base: string, value: unknown) {
  save(scopeKey(userId, base), value);
}

export function rememberHire(userId: string | undefined, task: HireRecord) {
  const prev = loadScoped<HireRecord[]>(userId, LS_TASKS, []);
  saveScoped(
    userId,
    LS_TASKS,
    [task, ...prev.filter((row) => row.id !== task.id)].slice(0, 24),
  );
}

export function useVaultUserId(): string | undefined {
  if (!HAS_PRIVY) return undefined;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- HAS_PRIVY is fixed at build time
  const { ready, authenticated, user } = usePrivy();
  if (!ready || !authenticated || !user) return undefined;
  return user.id;
}
