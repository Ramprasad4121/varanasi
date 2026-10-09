"use client";
// The whole people app: one mobile screen at a time, Telugu or English.
// Every action is signed on this device and sent through the relayer, so the
// person never pays any network charge.
import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeAbiParameters, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AppState } from "@/lib/state";
import { DICTS, errText, type Dict, type Lang } from "@/lib/i18n";
import { day, grams, refNo, rupees, when } from "@/lib/format";

type Session = { key: Hex; address: Address; phone: string; name: string; nameTe: string };
type Receipt = { kind: string; title: string; amount?: string; to?: string; ref: string; at: number; note?: string };
type Chit = AppState["chits"][number];

const LS = {
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

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || "UNKNOWN");
  return j;
}

export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState("home");
  const [state, setState] = useState<AppState | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const t: Dict = DICTS[lang];

  // restore language, session and screen
  useEffect(() => {
    setLang(LS.get<Lang>("vr.lang", "en"));
    setSession(LS.get<Session | null>("vr.session", null));
    const h = window.location.hash.replace(/^#/, "");
    if (h) setScreen(h);
    const onHash = () => setScreen(window.location.hash.replace(/^#/, "") || "home");
    window.addEventListener("hashchange", onHash);
    setReady(true);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const go = (s: string) => {
    setErr("");
    window.location.hash = s;
    setScreen(s);
    window.scrollTo(0, 0);
  };

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const r = await fetch(`/api/state?addr=${session.address}`, { cache: "no-store" });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setState(j);
      setLoadErr("");
    } catch (e) {
      setLoadErr((e as Error).message);
    }
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const receiptsKey = session ? `vr.receipts.${session.address}` : "";
  const addReceipt = (r: Receipt) => {
    const list = LS.get<Receipt[]>(receiptsKey, []);
    LS.set(receiptsKey, [r, ...list].slice(0, 200));
    setReceipt(r);
  };

  /** Sign on this phone, relayer sends it. Returns the record reference. */
  const act = async (action: string, args: Record<string, string>) => {
    if (!session) throw new Error("UNKNOWN");
    const prep = await post("/api/prepare", { from: session.address, action, args });
    const account = privateKeyToAccount(session.key);
    const m = prep.message;
    const signature = await account.signTypedData({
      domain: prep.domain,
      types: prep.types,
      primaryType: "ForwardRequest",
      message: { ...m, value: BigInt(m.value), gas: BigInt(m.gas), nonce: BigInt(m.nonce) },
    });
    const res = await post("/api/relay", { message: m, signature });
    return res.ref as string;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(errText(t, (e as Error).message));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const switchLang = () => {
    const n: Lang = lang === "en" ? "te" : "en";
    setLang(n);
    LS.set("vr.lang", n);
  };

  if (!ready) return null;

  const header = (
    <div className="top">
      <div className="brand">{t.appName}</div>
      <button className="lang" onClick={switchLang} aria-label="Change language">
        {t.switchLang}
      </button>
    </div>
  );

  if (!session) {
    return (
      <div className="shell">
        {header}
        <SignIn
          t={t}
          onDone={(s) => {
            LS.set("vr.session", s);
            setSession(s);
            go("home");
          }}
        />
      </div>
    );
  }

  const name = lang === "te" ? session.nameTe || session.name : session.name;
  const nav = (
    <nav className="nav">
      <div className="in">
        {[
          ["home", "🏠", t.navHome],
          ["gold", "🪙", t.navGold],
          ["chits", "👥", t.navChits],
          ["receipts", "🧾", t.navReceipts],
        ].map(([k, ic, label]) => (
          <button key={k} className={screen.split("/")[0] === k ? "on" : ""} onClick={() => go(k)}>
            <span className="ic" aria-hidden>
              {ic}
            </span>
            {label}
          </button>
        ))}
      </div>
    </nav>
  );

  let body: JSX.Element;
  if (loadErr && !state) {
    body = (
      <div className="card warn">
        <p>{errText(t, loadErr)}</p>
        <button className="btn" onClick={refresh}>
          {t.tryAgain}
        </button>
      </div>
    );
  } else if (!state) {
    body = <p className="muted">{t.working}</p>;
  } else {
    const p = { t, lang, state, go, busy, run, act, addReceipt, session, refresh };
    const [s0, s1] = screen.split("/");
    if (s0 === "gold" && s1 === "deposit") body = <GoldDeposit {...p} />;
    else if (s0 === "gold" && s1 === "send") body = <GoldSend {...p} />;
    else if (s0 === "gold" && s1 === "redeem") body = <GoldRedeem {...p} />;
    else if (s0 === "gold" && s1 === "proof") body = <GoldProof {...p} />;
    else if (s0 === "gold") body = <Gold {...p} />;
    else if (s0 === "chit" && s1) body = <ChitScreen {...p} address={s1 as Address} />;
    else if (s0 === "chits") body = <Chits {...p} />;
    else if (s0 === "receipts") body = <Receipts {...p} receiptsKey={receiptsKey} />;
    else body = <Home {...p} name={name} />;
  }

  return (
    <div className="shell">
      {header}
      {err && <div className="err" role="alert">{err}</div>}
      {body}
      {screen === "home" && (
        <button
          className="btn secondary"
          onClick={() => {
            window.localStorage.removeItem("vr.session");
            setSession(null);
            setState(null);
          }}
        >
          {t.signOut}
        </button>
      )}
      {nav}
      {receipt && <ReceiptSheet t={t} lang={lang} r={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

type P = {
  t: Dict;
  lang: Lang;
  state: AppState;
  go: (s: string) => void;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  act: (action: string, args: Record<string, string>) => Promise<string>;
  addReceipt: (r: Receipt) => void;
  session: Session;
  refresh: () => Promise<void>;
};

// ---------------------------------------------------------------- sign in
function SignIn({ t, onDone }: { t: Dict; onDone: (s: Session) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [e, setE] = useState("");
  const submit = async (ph: string, c?: string) => {
    setE("");
    try {
      const j = await post("/api/signin", c === undefined ? { phone: ph } : { phone: ph, code: c });
      if (c === undefined) setSent(true);
      else onDone({ key: j.key, address: j.address, phone: j.phone, name: j.name, nameTe: j.nameTe });
    } catch (x) {
      setE(errText(t, (x as Error).message));
    }
  };
  return (
    <div>
      <p className="muted">{t.tagline}</p>
      <h1>{t.signInTitle}</h1>
      {e && <div className="err">{e}</div>}
      <div className="field">
        <label htmlFor="ph">{t.phoneLabel}</label>
        <input id="ph" inputMode="numeric" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(x) => setPhone(x.target.value)} />
      </div>
      {!sent ? (
        <button className="btn" onClick={() => submit(phone)}>
          {t.sendCode}
        </button>
      ) : (
        <>
          <div className="field">
            <label htmlFor="otp">{t.codeLabel}</label>
            <input id="otp" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(x) => setCode(x.target.value)} />
            <p className="muted">{t.codeHint}</p>
          </div>
          <button className="btn" onClick={() => submit(phone, code)}>
            {t.verify}
          </button>
        </>
      )}
      <button className="btn demo" onClick={() => submit("9876543210", "123456")}>
        {t.demoUser}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- home
function Home({ t, lang, state, go, name }: P & { name: string }) {
  const due = state.dues[0];
  const joined = state.chits.filter((c) => c.me.joined);
  return (
    <div>
      <h1>
        {t.hello}
        {name ? `, ${name}` : ""}
      </h1>
      <button className="card gold" style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => go("gold")}>
        <div className="label">{t.myGold}</div>
        <div className="big">{grams(state.gold.milli)}</div>
        <div className="mid">
          {rupees(state.gold.valuePaise, false)} <span className="muted">{t.worth}</span>
        </div>
        <div className="muted">
          {t.priceNote}: {rupees(state.gold.pricePaisePerGram, false)} (demo)
        </div>
      </button>

      <div className={"card " + (due ? (due.late ? "warn" : "") : "ok")}>
        <div className="label">{t.nextPayment}</div>
        {due ? (
          <>
            <div className="big">{rupees(due.amountPaise, false)}</div>
            <div>{lang === "te" ? due.chitTe : due.chit}</div>
            <div className="muted">
              {due.late ? t.lateNow : `${t.dueBy} ${day(due.dueAt, lang)}`}
            </div>
            <button className="btn" onClick={() => go(`chit/${due.address}`)}>
              {t.payNow}
            </button>
          </>
        ) : (
          <div className="mid">{t.nothingDue}</div>
        )}
      </div>

      <h2>{t.myChits}</h2>
      {joined.length === 0 && <p className="muted">{t.noChits}</p>}
      {joined.map((c) => (
        <button key={c.address} className="card" style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => go(`chit/${c.address}`)}>
          <div className="mid">{lang === "te" ? c.nameTe : c.name}</div>
          <div>
            {rupees(c.contributionPaise, false)} {t.perMonth} · {c.memberCount} {t.members}
          </div>
          <div className="muted">
            {t.month} {c.round} {t.of} {c.memberCount} · {(t as any)["phase_" + c.phase]}
          </div>
          <div style={{ marginTop: 6 }}>
            {c.me.paidThisRound ? <span className="pill ok">✓ {t.youPaid}</span> : c.started ? <span className="pill wait">{t.notPaid}</span> : null}
          </div>
        </button>
      ))}

      <div className="tiles" style={{ marginTop: 8 }}>
        <button className="tile" onClick={() => go("gold/proof")}>
          <span className="ic">🏦</span>
          {t.proofTitle}
        </button>
        <button className="tile" onClick={() => go("receipts")}>
          <span className="ic">🧾</span>
          {t.navReceipts}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- gold
function Gold({ t, lang, state, go }: P) {
  const bank = state.reserve.banks[0];
  return (
    <div>
      <h1>{t.goldTitle}</h1>
      <div className="card gold">
        <div className="label">{t.myGoldList}</div>
        <div className="big">{grams(state.gold.milli)}</div>
        <div className="mid">{rupees(state.gold.valuePaise, false)}</div>
        <div className="muted">
          {t.pureGold} · {bank?.name}
        </div>
      </div>
      <div className="tiles">
        <button className="tile" onClick={() => go("gold/deposit")}>
          <span className="ic">🏦</span>
          {t.howDeposit}
        </button>
        <button className="tile" onClick={() => go("gold/send")}>
          <span className="ic">📲</span>
          {t.sendGold}
        </button>
        <button className="tile" onClick={() => go("gold/redeem")}>
          <span className="ic">🤝</span>
          {t.takeGold}
        </button>
        <button className="tile" onClick={() => go("gold/proof")}>
          <span className="ic">✅</span>
          {t.proofTitle}
        </button>
      </div>
      <h2>{t.certificates}</h2>
      {state.reserve.certificates.filter((c) => c.mine).map((c) => (
        <div className="cert" key={c.certificateNo}>
          <div className="mono">{c.certificateNo}</div>
          <div className="row">
            <span>{t.pureGold}</span>
            <span className="v">{grams(c.milli)}</span>
          </div>
          <div className="row">
            <span>{t.purity}</span>
            <span className="v">{(c.purity / 10).toFixed(1)}%</span>
          </div>
          <div className="row">
            <span>{t.depositedOn}</span>
            <span className="v">{day(c.at, lang)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function GoldDeposit({ t, lang, state, go, busy, run, addReceipt, session }: P) {
  const bank = state.reserve.banks[0];
  return (
    <div>
      <button className="back" onClick={() => go("gold")}>
        ← {t.back}
      </button>
      <h1>{t.howDeposit}</h1>
      <div className="card">
        <div className="label">{bank?.name}</div>
        <ol className="steps">
          <li>{t.depositStep1}</li>
          <li>{t.depositStep2}</li>
          <li>{t.depositStep3}</li>
          <li>{t.depositStep4}</li>
          <li>{t.depositStep5}</li>
        </ol>
        <p className="muted">{t.depositNote}</p>
      </div>
      <div className="demo-box">
        <div className="label">{t.bankCounter}</div>
        <p className="muted">{t.bankCounterHint}</p>
        <button
          className="btn demo"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const j = await post("/api/demo", { op: "bankDeposit", addr: session.address, grams: "10", purity: "916" });
              addReceipt({
                kind: "deposit",
                title: t.r_deposit,
                amount: `${grams(j.milli)} ${t.pureGold}`,
                to: j.certNo,
                ref: j.ref,
                at: Math.floor(Date.now() / 1000),
                note: bank?.name,
              });
            })
          }
        >
          {busy ? t.working : t.doDeposit}
        </button>
      </div>
    </div>
  );
}

function GoldSend({ t, state, go, busy, run, act, addReceipt }: P) {
  const [to, setTo] = useState("");
  const [g, setG] = useState("1");
  const price = Number(state.gold.pricePaisePerGram);
  return (
    <div>
      <button className="back" onClick={() => go("gold")}>
        ← {t.back}
      </button>
      <h1>{t.sendGold}</h1>
      <p className="muted">
        {t.myGoldList}: {grams(state.gold.milli)}
      </p>
      <div className="field">
        <label htmlFor="to">{t.sendTo}</label>
        <input id="to" inputMode="numeric" placeholder="90000 00001" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="g">{t.grams}</label>
        <input id="g" inputMode="decimal" value={g} onChange={(e) => setG(e.target.value)} />
        <p className="muted">≈ {rupees(Math.round((Number(g) || 0) * price), false)}</p>
      </div>
      <p className="muted">{t.sendHint}</p>
      <button
        className="btn"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const ref = await act("gold.send", { toPhone: to, grams: g });
            addReceipt({
              kind: "send",
              title: t.r_send,
              amount: `${grams(Math.round(Number(g) * 1000))} (${rupees(Math.round(Number(g) * price), false)})`,
              to: to,
              ref,
              at: Math.floor(Date.now() / 1000),
            });
          })
        }
      >
        {busy ? t.working : t.send}
      </button>
    </div>
  );
}

function GoldRedeem({ t, lang, state, go, busy, run, act, addReceipt }: P) {
  const [g, setG] = useState("1");
  const bank = state.reserve.banks[0];
  const pillCls: Record<string, string> = { PENDING: "wait", FULFILLED: "ok", CANCELLED: "no" };
  return (
    <div>
      <button className="back" onClick={() => go("gold")}>
        ← {t.back}
      </button>
      <h1>{t.takeGold}</h1>
      <p className="muted">{t.takeHint}</p>
      <div className="card">
        <div className="row">
          <span>{t.myGoldList}</span>
          <span className="v">{grams(state.gold.milli)}</span>
        </div>
        <div className="row">
          <span>{t.branch}</span>
          <span className="v">{bank?.name}</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="rg">{t.grams}</label>
        <input id="rg" inputMode="decimal" value={g} onChange={(e) => setG(e.target.value)} />
      </div>
      <button
        className="btn"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const ref = await act("gold.redeem", { grams: g, branch: state.reserve.branch });
            addReceipt({
              kind: "redeem",
              title: t.r_redeem,
              amount: grams(Math.round(Number(g) * 1000)),
              to: bank?.name,
              ref,
              at: Math.floor(Date.now() / 1000),
            });
          })
        }
      >
        {busy ? t.working : t.request}
      </button>

      <h2>{t.status}</h2>
      {state.gold.redemptions.length === 0 && <p className="muted">{t.noRequests}</p>}
      {[...state.gold.redemptions].reverse().map((r) => (
        <div className="card" key={r.id}>
          <div className="row">
            <span>
              {t.requestNo} {r.id}
            </span>
            <span className={"pill " + pillCls[r.status]}>{(t as any)["st_" + r.status]}</span>
          </div>
          <div className="row">
            <span>{grams(r.milli)}</span>
            <span className="muted">{when(r.requestedAt, lang)}</span>
          </div>
          {r.status === "PENDING" && (
            <button
              className="btn demo"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const j = await post("/api/demo", { op: "bankRelease", id: String(r.id) });
                  addReceipt({
                    kind: "release",
                    title: t.r_release,
                    amount: grams(r.milli),
                    to: bank?.name,
                    ref: j.ref,
                    at: Math.floor(Date.now() / 1000),
                  });
                })
              }
            >
              {t.bankRelease}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function GoldProof({ t, lang, state, go }: P) {
  const r = state.reserve;
  const held = r.attestedMilli;
  const issued = r.supplyMilli;
  const pct = held > 0 ? Math.min(100, Math.round((held / Math.max(issued, 1)) * 100)) : 0;
  return (
    <div>
      <button className="back" onClick={() => go("gold")}>
        ← {t.back}
      </button>
      <h1>{t.proofTitle}</h1>
      {r.banks.map((b) => (
        <div key={b.bankId} className={"card " + (b.fullyBacked ? "ok" : "warn")}>
          <div className="mid">🏦 {b.name}</div>
          <div className="row">
            <span>{t.bankHolds}</span>
            <span className="v">{grams(b.heldMilli)}</span>
          </div>
          <div className="row">
            <span>{t.appIssued}</span>
            <span className="v">{grams(b.owedMilli)}</span>
          </div>
          {b.awaitingMilli > 0 && (
            <div className="row">
              <span>{t.awaiting}</span>
              <span className="v">{grams(b.awaitingMilli)}</span>
            </div>
          )}
          <div className="bar" aria-hidden>
            <div style={{ width: `${b.fullyBacked ? 100 : pct}%` }} />
          </div>
          <div className="mid">{b.fullyBacked ? `✓ ${t.fullyBacked}` : `⚠ ${t.notBacked}`}</div>
          <div className="muted">
            {t.valueAll}: {rupees(b.valuePaise, false)} (demo)
          </div>
        </div>
      ))}
      <p>{t.proofExplain}</p>
      <h2>{t.certificates}</h2>
      {r.certificates.map((c) => (
        <div className="cert" key={c.certificateNo}>
          <div className="row">
            <span className="mono">{c.certificateNo}</span>
            {c.mine && <span className="pill ok">{t.mine}</span>}
          </div>
          <div className="row">
            <span>
              {grams(c.milli)} · {t.purity} {(c.purity / 10).toFixed(1)}%
            </span>
            <span className="muted">{day(c.at, lang)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- chits
function Chits({ t, lang, state, go, busy, run, act, addReceipt }: P) {
  const invites = state.chits.filter((c) => !c.me.joined && !c.started);
  const mine = state.chits.filter((c) => c.me.joined);
  return (
    <div>
      <h1>{t.chitsTitle}</h1>
      {mine.map((c) => (
        <button key={c.address} className="card" style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => go(`chit/${c.address}`)}>
          <div className="mid">{lang === "te" ? c.nameTe : c.name}</div>
          <div>
            {rupees(c.contributionPaise, false)} {t.perMonth} · {c.memberCount} {t.members}
          </div>
          <div className="muted">
            {c.started ? `${t.month} ${c.round} ${t.of} ${c.memberCount} · ` : ""}
            {(t as any)["phase_" + c.phase]}
          </div>
        </button>
      ))}
      {invites.length > 0 && <h2>{t.invites}</h2>}
      {invites.map((c) => (
        <div key={c.address} className="card gold">
          <div className="mid">{lang === "te" ? c.nameTe : c.name}</div>
          <div className="row">
            <span>{t.perMonth}</span>
            <span className="v">{rupees(c.contributionPaise, false)}</span>
          </div>
          <div className="row">
            <span>{t.potSize}</span>
            <span className="v">{rupees(c.fullPotPaise, false)}</span>
          </div>
          <div className="row">
            <span>{t.members}</span>
            <span className="v">
              {c.enrolledCount} / {c.memberCount}
            </span>
          </div>
          <div className="row">
            <span>{t.foreman}</span>
            <span className="v">{c.foreman}</span>
          </div>
          <div className="row">
            <span>{t.foremanFee}</span>
            <span className="v">{t.feeCap}</span>
          </div>
          <p className="muted">{t.joinHint}</p>
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (!c.me.allowanceOk) await act("chit.allow", { fund: c.address });
                const ref = await act("chit.join", { fund: c.address });
                addReceipt({ kind: "join", title: t.r_join, to: lang === "te" ? c.nameTe : c.name, ref, at: Math.floor(Date.now() / 1000) });
              })
            }
          >
            {busy ? t.working : t.joinGroup}
          </button>
        </div>
      ))}
      <MissedPayment t={t} />
    </div>
  );
}

function MissedPayment({ t, c }: { t: Dict; c?: Chit }) {
  return (
    <div className="card">
      <div className="mid">{t.missTitle}</div>
      <ol className="steps">
        <li>{t.missText1}</li>
        <li>
          {t.missText2}
          {c ? ` (${t.lateFeeIs}: ${rupees(c.lateFeePaise, false)})` : ""}
        </li>
        <li>{t.missText3}</li>
        <li>{t.missText4}</li>
      </ol>
    </div>
  );
}

function bidStoreKey(fund: string, round: number, addr: string) {
  return `vr.bid.${fund}.${round}.${addr}`.toLowerCase();
}

function ChitScreen({ t, lang, state, go, busy, run, act, addReceipt, session, address }: P & { address: Address }) {
  const c = state.chits.find((x) => x.address.toLowerCase() === address.toLowerCase());
  const [bid, setBid] = useState("");
  const stored = useMemo(
    () => (c ? LS.get<{ bid: string; salt: Hex } | null>(bidStoreKey(c.address, c.round, session.address), null) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c?.address, c?.round, c?.me.hasSealedBid, session.address]
  );
  if (!c) return <p className="muted">{t.noChits}</p>;
  const cname = lang === "te" ? c.nameTe : c.name;
  const nm = (m: { name: string; nameTe: string }) => (lang === "te" ? m.nameTe || m.name : m.name);
  const canPay = c.started && !c.finalized && !c.me.paidThisRound && !c.me.excluded && (c.phase === "pay" || c.phase === "late");
  const canBid = c.started && !c.me.won && !c.me.excluded && !c.me.hasSealedBid && (c.phase === "pay" || c.phase === "late");
  const canOpen = c.me.hasSealedBid && !c.me.bidOpened && c.phase === "openBids" && !!stored;
  const payAmount = BigInt(c.contributionPaise) + (c.phase === "late" ? BigInt(c.lateFeePaise) : 0n);

  const pay = () =>
    run(async () => {
      if (!c.me.allowanceOk) await act("chit.allow", { fund: c.address });
      const ref = await act("chit.pay", { fund: c.address });
      addReceipt({
        kind: "pay",
        title: `${t.r_pay}: ${t.month} ${c.round}`,
        amount: rupees(payAmount, false),
        to: cname,
        ref,
        at: Math.floor(Date.now() / 1000),
      });
    });

  const seal = () =>
    run(async () => {
      const rupeesVal = Number(bid.replace(/[^\d.]/g, ""));
      if (!rupeesVal) throw new Error("BAD_AMOUNT");
      const paise = BigInt(Math.round(rupeesVal * 100));
      const lo = BigInt(c.minBidPaise);
      const hi = BigInt(c.potPaise);
      if (paise < lo || paise > hi) throw new Error("BidOutOfRange");
      const salt = keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
      const h = keccak256(
        encodeAbiParameters(
          [{ type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
          [c.address, BigInt(c.round), session.address, paise, salt]
        )
      );
      LS.set(bidStoreKey(c.address, c.round, session.address), { bid: paise.toString(), salt });
      const ref = await act("chit.bid", { fund: c.address, hash: h });
      addReceipt({
        kind: "bid",
        title: `${t.r_bid}: ${t.month} ${c.round}`,
        amount: rupees(paise, false),
        to: cname,
        ref,
        at: Math.floor(Date.now() / 1000),
      });
    });

  const openMine = async () => {
    if (!stored) return "";
    return act("chit.reveal", { fund: c.address, bid: stored.bid, salt: stored.salt });
  };

  return (
    <div>
      <button className="back" onClick={() => go("chits")}>
        ← {t.back}
      </button>
      <h1>{cname}</h1>
      <div className="card">
        <div className="row">
          <span>{t.perMonth}</span>
          <span className="v">{rupees(c.contributionPaise, false)}</span>
        </div>
        <div className="row">
          <span>{t.potSize}</span>
          <span className="v">{rupees(c.fullPotPaise, false)}</span>
        </div>
        <div className="row">
          <span>{t.month}</span>
          <span className="v">
            {c.round} {t.of} {c.memberCount}
          </span>
        </div>
        <div className="row">
          <span>{t.status}</span>
          <span className="v">{(t as any)["phase_" + c.phase]}</span>
        </div>
        <div className="row">
          <span>{t.foremanFee}</span>
          <span className="v">≤ 5%</span>
        </div>
      </div>

      {c.me.excluded && <div className="card warn">{t.excludedNote}</div>}

      {/* pay this month */}
      <h2>{t.payThisMonth}</h2>
      {c.me.paidThisRound ? (
        <div className="card ok mid">✓ {t.youPaid}</div>
      ) : canPay ? (
        <div className={"card " + (c.phase === "late" ? "warn" : "")}>
          <div className="big">{rupees(payAmount, false)}</div>
          <div className="muted">
            {c.phase === "late" ? t.lateNow : `${t.dueBy} ${day(c.payDeadline, lang)}`}
          </div>
          <div className="muted">
            {t.bankMoney}: {rupees(state.rupeePaise, false)}
          </div>
          <button className="btn green" disabled={busy} onClick={pay}>
            {busy ? t.working : `${t.payNow} ${rupees(payAmount, false)}`}
          </button>
        </div>
      ) : (
        <p className="muted">{(t as any)["phase_" + c.phase]}</p>
      )}

      {/* sealed bid */}
      {c.started && !c.finalized && (
        <>
          <h2>{t.placeBid}</h2>
          <div className="card">
            {c.me.won ? (
              <p>{t.alreadyWon}</p>
            ) : c.me.hasSealedBid ? (
              <>
                <p className="mid">🔒 {t.bidSealed}</p>
                {stored && (
                  <p>
                    {t.bidAmount}: <b>{rupees(stored.bid, false)}</b>
                  </p>
                )}
                {canOpen && (
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const ref = await openMine();
                        addReceipt({
                          kind: "reveal",
                          title: `${t.r_reveal}: ${t.month} ${c.round}`,
                          amount: rupees(stored!.bid, false),
                          to: cname,
                          ref,
                          at: Math.floor(Date.now() / 1000),
                        });
                      })
                    }
                  >
                    {t.openBid}
                  </button>
                )}
              </>
            ) : canBid ? (
              <>
                <p className="muted">{t.bidHint}</p>
                {!c.me.paidThisRound && <p className="muted">{t.payFirst}</p>}
                <div className="field">
                  <label htmlFor="bid">{t.bidAmount} (₹)</label>
                  <input id="bid" inputMode="numeric" placeholder={String(Number(c.minBidPaise) / 100)} value={bid} onChange={(e) => setBid(e.target.value)} />
                  <p className="muted">
                    {t.between} {rupees(c.minBidPaise, false)} {t.and} {rupees(c.potPaise, false)}
                  </p>
                </div>
                <button className="btn" disabled={busy} onClick={seal}>
                  {busy ? t.working : `🔒 ${t.sealBid}`}
                </button>
              </>
            ) : (
              <p className="muted">{(t as any)["phase_" + c.phase]}</p>
            )}
          </div>
        </>
      )}

      {/* dividend */}
      <h2>{t.myDividend}</h2>
      <div className="card">
        <div className="row">
          <span>{t.dividendTotal}</span>
          <span className="v">{rupees(c.me.dividendsTotalPaise, false)}</span>
        </div>
        {BigInt(c.me.prizeHeldPaise) > 0n && (
          <div className="row">
            <span>{t.prizeHeld}</span>
            <span className="v">{rupees(c.me.prizeHeldPaise, false)}</span>
          </div>
        )}
        <div className="row">
          <span>{t.canTake}</span>
          <span className="v">{rupees(c.me.canTakePaise, false)}</span>
        </div>
        {BigInt(c.me.canTakePaise) > 0n && (
          <button
            className="btn green"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const ref = await act("chit.withdraw", { fund: c.address });
                addReceipt({ kind: "withdraw", title: t.r_withdraw, amount: rupees(c.me.canTakePaise, false), to: cname, ref, at: Math.floor(Date.now() / 1000) });
              })
            }
          >
            {busy ? t.working : t.takeMoney}
          </button>
        )}
      </div>

      {/* who won and why */}
      <h2>{t.whoWon}</h2>
      {c.results.length === 0 && <p className="muted">{(t as any)["phase_" + c.phase]}</p>}
      {[...c.results].reverse().map((r) => {
        const left = BigInt(r.potPaise) - BigInt(r.payoutPaise);
        const shared = left - BigInt(r.commissionPaise);
        return (
          <div className="card" key={r.round}>
            <div className="label">
              {t.month} {r.round}
            </div>
            <div className="mid">
              🏆 {r.winnerIsMe ? t.you : lang === "te" ? r.winnerNameTe || r.winnerName : r.winnerName} {t.took} {rupees(r.payoutPaise, false)}
            </div>
            {r.bids.length > 0 && <p>{t.lowestBid}</p>}
            <div className="row">
              <span>{t.potSize}</span>
              <span className="v">{rupees(r.potPaise, false)}</span>
            </div>
            <div className="row">
              <span>{t.discount}</span>
              <span className="v">{rupees(left, false)}</span>
            </div>
            <div className="row">
              <span>{t.foremanFee}</span>
              <span className="v">{rupees(r.commissionPaise, false)}</span>
            </div>
            <div className="row">
              <span>{t.sharedAs}</span>
              <span className="v">
                {rupees(shared, false)} ({rupees(r.dividendEachPaise, false)} {t.each})
              </span>
            </div>
            {r.bids.length > 0 && (
              <>
                <div className="label" style={{ marginTop: 8 }}>
                  {t.allBids}
                </div>
                {r.bids.map((b, i) => (
                  <div className="row" key={i}>
                    <span>
                      {i === 0 ? "🏆 " : ""}
                      {nm(b)}
                    </span>
                    <span className="v">{rupees(b.bidPaise, false)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        );
      })}

      {/* members */}
      <h2>
        {c.memberCount} {t.members}
      </h2>
      <div className="card">
        {c.members.map((m) => (
          <div className="row" key={m.address}>
            <span>
              {m.isMe ? `${nm(m)} (${t.you})` : nm(m)}
              {m.won ? ` 🏆 ${t.month} ${m.wonRound}` : ""}
            </span>
            <span className={"pill " + (m.paidThisRound ? "ok" : c.started ? "wait" : "wait")}>
              {c.started ? (m.paidThisRound ? t.paid : t.notPaid) : m.joined ? "✓" : "…"}
            </span>
          </div>
        ))}
      </div>

      <MissedPayment t={t} c={c} />

      <div className="demo-box">
        <div className="label">{t.demoNext}</div>
        <p className="muted">{t.demoNextHint}</p>
        <button
          className="btn demo"
          disabled={busy || !c.started || c.finalized}
          onClick={() =>
            run(async () => {
              if (canOpen) await openMine();
              await post("/api/demo", { op: "nextStep", fund: c.address, addr: session.address });
            })
          }
        >
          {busy ? t.working : t.demoNext}
        </button>
        <button
          className="btn demo"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const j = await post("/api/demo", { op: "addMoney", addr: session.address });
              addReceipt({ kind: "addMoney", title: t.r_addMoney, amount: "₹10,000", ref: j.ref, at: Math.floor(Date.now() / 1000) });
            })
          }
        >
          {t.addMoney}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- receipts
function Receipts({ t, lang, receiptsKey }: P & { receiptsKey: string }) {
  const [open, setOpen] = useState<Receipt | null>(null);
  const list = LS.get<Receipt[]>(receiptsKey, []);
  return (
    <div>
      <h1>{t.receiptsTitle}</h1>
      {list.length === 0 && <p className="muted">{t.noReceipts}</p>}
      {list.map((r, i) => (
        <button key={i} className="card" style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => setOpen(r)}>
          <div className="row">
            <span className="mid" style={{ fontSize: 20 }}>
              {r.title}
            </span>
            <span className="v">{r.amount}</span>
          </div>
          <div className="muted">{when(r.at, lang)}</div>
        </button>
      ))}
      {open && <ReceiptSheet t={t} lang={lang} r={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ReceiptSheet({ t, lang, r, onClose }: { t: Dict; lang: Lang; r: Receipt; onClose: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="sheet">
        <div className="tick">✓</div>
        <div className="center label">{t.receipt}</div>
        <h1 className="center">{r.title}</h1>
        {r.amount && <div className="center big">{r.amount}</div>}
        <div className="card">
          {r.to && (
            <div className="row">
              <span>{t.to}</span>
              <span className="v">{r.to}</span>
            </div>
          )}
          {r.note && (
            <div className="row">
              <span>{t.branch}</span>
              <span className="v">{r.note}</span>
            </div>
          )}
          <div className="row">
            <span>{t.dateTime}</span>
            <span className="v">{when(r.at, lang)}</span>
          </div>
          <div className="row">
            <span>{t.refNo}</span>
            <span className="v mono">{refNo(r.ref)}</span>
          </div>
          <div className="row">
            <span>✓</span>
            <span className="v">{t.noCharge}</span>
          </div>
        </div>
        <button className="btn" onClick={onClose}>
          {t.done}
        </button>
      </div>
    </div>
  );
}
