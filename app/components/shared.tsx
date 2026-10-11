"use client";
import type { AppState, SignIn } from "@/lib/types";
import type { Dict, Lang } from "@/lib/i18n";

export type Receipt = { kind: string; title: string; amount?: string; to?: string; ref: string; at: number; note?: string };

/** Props every signed-in screen gets. */
export type P = {
  t: Dict;
  lang: Lang;
  state: AppState;
  go: (s: string) => void;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  act: (action: string, args: Record<string, string>) => Promise<string>;
  demo: (op: string, body: Record<string, string>) => Promise<any>;
  addReceipt: (r: Receipt) => void;
  session: SignIn;
  refresh: () => Promise<void>;
};

export const LS = {
  get<T>(k: string, d: T): T {
    if (typeof window === "undefined") return d;
    try {
      const v = window.localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    window.localStorage.setItem(k, JSON.stringify(v));
  },
};

/** Receipt time: the ledger's clock (demo buttons move it forward), so receipts and
 *  due dates agree. */
export const nowOf = (state: AppState) => state.now;

export function Back({ t, to, go }: { t: Dict; to: string; go: (s: string) => void }) {
  return (
    <button className="back" onClick={() => go(to)}>
      ← {t.back}
    </button>
  );
}
