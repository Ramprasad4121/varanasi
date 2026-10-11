"use client";
// One client API for the screens, two back ends:
//   local  (default): the app's own server routes, a LOCAL anvil chain, every action
//                     signed on this device and sent through the relayer.
//   public (NEXT_PUBLIC_VARANASI_MODE=public): the demo ledger in lib/sim runs in this
//                     browser. No chain, no server state, TEST money only. For a
//                     hosted public demo (Vercel) with nothing to keep running.
import { privateKeyToAccount } from "viem/accounts";
import type { AppState, Mode, SignIn } from "./types";
import { Sim, type World } from "./sim/engine";

export const MODE: Mode = process.env.NEXT_PUBLIC_VARANASI_MODE === "public" ? "public" : "local";

export interface Backend {
  mode: Mode;
  signin(phone: string, code?: string): Promise<any>;
  state(addr: string): Promise<AppState>;
  act(session: SignIn, action: string, args: Record<string, string>): Promise<string>;
  demo(op: string, body: Record<string, string>): Promise<any>;
  reset(): Promise<void>;
}

export async function post(url: string, body: unknown) {
  let r: Response;
  try {
    r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("OFFLINE");
  }
  let j: any = {};
  try {
    j = await r.json();
  } catch {
    throw new Error("UNKNOWN");
  }
  if (!r.ok || j.error) throw new Error(j.error || "UNKNOWN");
  return j;
}

const local: Backend = {
  mode: "local",
  signin: (phone, code) => post("/api/signin", code === undefined ? { phone } : { phone, code }),
  async state(addr) {
    let r: Response;
    try {
      r = await fetch(`/api/state?addr=${addr}`, { cache: "no-store" });
    } catch {
      throw new Error("OFFLINE");
    }
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j as AppState;
  },
  /** Sign on this phone, relayer sends it. Returns the record reference. */
  async act(session, action, args) {
    const prep = await post("/api/prepare", { from: session.address, action, args });
    const account = privateKeyToAccount(session.key as `0x${string}`);
    const m = prep.message;
    const signature = await account.signTypedData({
      domain: prep.domain,
      types: prep.types,
      primaryType: "ForwardRequest",
      message: { ...m, value: BigInt(m.value), gas: BigInt(m.gas), nonce: BigInt(m.nonce) },
    });
    const res = await post("/api/relay", { message: m, signature });
    return res.ref as string;
  },
  demo: (op, body) => post("/api/demo", { op, ...body }),
  async reset() {
    /* the local demo resets by restarting scripts/app-demo.sh */
  },
};

const WORLD_KEY = "vr.public.world";
const pause = () => new Promise((r) => setTimeout(r, 120));

function loadWorld(): World {
  try {
    const raw = window.localStorage.getItem(WORLD_KEY);
    if (raw) {
      const w = JSON.parse(raw) as World;
      if (w && w.v === 2) return w;
    }
  } catch {
    /* fall through to a fresh demo */
  }
  const w = Sim.seed();
  window.localStorage.setItem(WORLD_KEY, JSON.stringify(w));
  return w;
}

/** Runs one step on a copy of the world and keeps it only if the step succeeds,
 *  so a refused action changes nothing (like a reverted transaction). */
function step<T>(fn: (s: Sim) => T): T {
  const copy = JSON.parse(JSON.stringify(loadWorld())) as World;
  const s = new Sim(copy);
  const out = fn(s);
  window.localStorage.setItem(WORLD_KEY, JSON.stringify(copy));
  return out;
}

const publicDemo: Backend = {
  mode: "public",
  async signin(phone, code) {
    await pause();
    return step((s) => s.signin(phone, code));
  },
  async state(addr) {
    return new Sim(loadWorld()).state(addr);
  },
  async act(session, action, args) {
    await pause();
    return step((s) => s.act(session.address, action, args));
  },
  async demo(op, body) {
    await pause();
    return step((s) => s.demo(op, body));
  },
  async reset() {
    window.localStorage.removeItem(WORLD_KEY);
    for (const k of Object.keys(window.localStorage)) if (k.startsWith("vr.receipts.") || k.startsWith("vr.bid.")) window.localStorage.removeItem(k);
    loadWorld();
  },
};

export const api: Backend = MODE === "public" ? publicDemo : local;
