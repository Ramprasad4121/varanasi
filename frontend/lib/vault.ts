"use client";

// Author: Ramprasad — per-user vault. Keys never stored. Guest data migrates on first sign-in.
// Every personal record lives under a key scoped to the signed-in Privy user id, so accounts
// sharing one browser never read each other's data. See frontend/README.md → "Vault".
import { usePrivy } from "@privy-io/react-auth";

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

function saveMaybe(key: string, value: unknown) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private-mode: ignore */
  }
}

/**
 * Read a personal record. When signed in, the per-account key wins; legacy
 * unscoped (guest) data is migrated into the account once and the shared key
 * is deleted, so a sign-out or the next person on this machine cannot see it.
 */
export function loadScoped<T>(userId: string | undefined, base: string, fallback: T): T {
  if (userId) {
    const own = loadMaybe<T>(scopeKey(userId, base));
    if (own !== undefined) return own;
    const guest = loadMaybe<T>(base);
    if (guest !== undefined) {
      saveMaybe(scopeKey(userId, base), guest);
      try {
        localStorage.removeItem(base);
      } catch {
        /* private-mode: ignore */
      }
      return guest;
    }
    return fallback;
  }
  return loadMaybe<T>(base) ?? fallback;
}

/** Write a personal record under the caller's scope (guest key when signed out). */
export function saveScoped(userId: string | undefined, base: string, value: unknown) {
  saveMaybe(scopeKey(userId, base), value);
}

/** Remove a personal record from both the scoped key and the legacy guest key. */
export function removeScoped(userId: string | undefined, base: string) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(scopeKey(userId, base));
    localStorage.removeItem(base);
  } catch {
    /* private-mode: ignore */
  }
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
