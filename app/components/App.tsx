"use client";
// The people app: one mobile screen at a time, Telugu or English.
// LOCAL demo: every action is signed on this device and sent through the relayer to a
// local chain, so the person never pays a network charge. PUBLIC demo: the same
// screens run on a test ledger inside the browser (lib/sim). Both use TEST money only.
import { useCallback, useEffect, useState } from "react";
import type { AppState, SignIn } from "@/lib/types";
import { api, MODE } from "@/lib/api";
import { DICTS, errText, type Dict, type Lang } from "@/lib/i18n";
import { validate } from "@/lib/waitlist-rules";
import { LS, type P, type Receipt } from "./shared";
import { Gold, GoldDeposit, GoldProof, GoldRedeem, GoldSend } from "./GoldScreens";
import { Chits, ChitScreen } from "./ChitScreens";
import { Loans } from "./Loans";
import { BankDesk, Pledge, Silver } from "./AssetScreens";
import { Home, Receipts, ReceiptSheet } from "./HomeScreens";
import { Icon } from "./Icon";

export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const [session, setSession] = useState<SignIn | null>(null);
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
    setSession(LS.get<SignIn | null>("vr.session", null));
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
      setState(await api.state(session.address));
      setLoadErr("");
    } catch (e) {
      setLoadErr((e as Error).message);
    }
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const receiptsKey = session && state ? `vr.receipts.${state.ledgerId}.${session.address}` : "";
  const addReceipt = (r: Receipt) => {
    if (!receiptsKey) return;
    const list = LS.get<Receipt[]>(receiptsKey, []);
    LS.set(receiptsKey, [r, ...list].slice(0, 200));
    setReceipt(r);
  };

  const act = async (action: string, args: Record<string, string>) => {
    if (!session) throw new Error("UNKNOWN");
    return api.act(session, action, args);
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

  const banner = (
    <div className="demo-banner" role="note">
      {MODE === "public" ? t.bannerPublic : t.bannerLocal}
    </div>
  );
  const header = (
    <header>
      {banner}
      <div className="top">
        <div className="brand">
          {/* official gold V mark (docs/logo.png) */}
          <img src="/logo-v.png" alt={t.logoAlt} width={40} height={40} className="logo" />
          <span>{t.appName}</span>
        </div>
        <button className="lang" onClick={switchLang} aria-label={lang === "en" ? "తెలుగులో చూడండి" : "Show in English"}>
          {t.switchLang}
        </button>
      </div>
    </header>
  );

  if (!session) {
    const s0 = screen.split("/")[0];
    return (
      <div className="shell out">
        {header}
        <main>
          {s0 === "signin" ? (
            <SignInScreen
              t={t}
              back={() => go("home")}
              onDone={(s) => {
                LS.set("vr.session", s);
                setSession(s);
                go("home");
              }}
            />
          ) : s0 === "waitlist" ? (
            <Waitlist t={t} lang={lang} back={() => go("home")} />
          ) : (
            <Landing t={t} go={go} />
          )}
        </main>
      </div>
    );
  }

  const name = lang === "te" ? session.nameTe || session.name : session.name;
  const nav = (
    <nav className="nav" aria-label="Main">
      <div className="in">
        {[
          ["home", "home", t.navHome],
          ["gold", "gold", t.navGold],
          ["chits", "chits", t.navChits],
          ["receipts", "receipts", t.navReceipts],
        ].map(([k, ic, label]) => (
          <button
            key={k}
            className={screen.split("/")[0] === k ? "on" : ""}
            onClick={() => go(k)}
            aria-current={screen.split("/")[0] === k ? "page" : undefined}
          >
            <span className="ic">
              <Icon name={ic} size={26} />
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
    body = (
      <div aria-busy="true" aria-live="polite">
        <p className="muted">{t.loading}</p>
        <div className="skeleton tall" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );
  } else {
    const p: P = { t, lang, state, go, busy, run, act, addReceipt, session, refresh, demo: api.demo };
    const [s0, s1] = screen.split("/");
    if (s0 === "gold" && s1 === "deposit") body = <GoldDeposit {...p} />;
    else if (s0 === "gold" && s1 === "send") body = <GoldSend {...p} />;
    else if (s0 === "gold" && s1 === "redeem") body = <GoldRedeem {...p} />;
    else if (s0 === "gold" && s1 === "proof") body = <GoldProof {...p} />;
    else if (s0 === "gold" && s1 === "loan") body = <Loans {...p} />;
    else if (s0 === "gold") body = <Gold {...p} />;
    else if (s0 === "silver") body = <Silver {...p} />;
    else if (s0 === "pledge") body = <Pledge {...p} />;
    else if (s0 === "bank") body = <BankDesk {...p} />;
    else if (s0 === "chit" && s1) body = <ChitScreen {...p} address={s1} />;
    else if (s0 === "chits") body = <Chits {...p} />;
    else if (s0 === "receipts") body = <Receipts {...p} receiptsKey={receiptsKey} />;
    else body = <Home {...p} name={name} />;
  }

  const signOut = () => {
    window.localStorage.removeItem("vr.session");
    setSession(null);
    setState(null);
    go("home");
  };

  return (
    <div className="shell">
      {header}
      <main>
        {body}
        {(screen === "home" || screen === "") && (
          <>
            <button className="btn quiet" onClick={signOut}>
              {t.signOut}
            </button>
            {MODE === "public" && (
              <div className="demo-box">
                <p className="muted">{t.resetHint}</p>
                <button
                  className="btn demo"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api.reset();
                    })
                  }
                >
                  {t.resetDemo}
                </button>
              </div>
            )}
          </>
        )}
      </main>
      {err && (
        <div className="toast" role="alert">
          <span>{err}</span>
          <button className="toast-x" onClick={() => setErr("")} aria-label={t.close}>
            ×
          </button>
        </div>
      )}
      {nav}
      {receipt && <ReceiptSheet t={t} lang={lang} r={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- landing (signed out)
function Landing({ t, go }: { t: Dict; go: (s: string) => void }) {
  return (
    <div>
      <div className="hero">
        <img src="/logo-v.png" alt="" width={72} height={72} />
      </div>
      <h1>{t.landTitle}</h1>
      <p>{t.landIntro}</p>
      <button className="btn" onClick={() => go("signin")}>
        {t.tryDemo}
      </button>
      <button className="btn secondary" onClick={() => go("waitlist")}>
        {t.joinWaitlist}
      </button>
      <div className="card gold">
        <div className="mid with-ic">
          <Icon name="gold" /> {t.landGold}
        </div>
        <p>{t.landGoldText}</p>
      </div>
      <div className="card">
        <div className="mid with-ic">
          <Icon name="chits" /> {t.landChit}
        </div>
        <p>{t.landChitText}</p>
      </div>
      <div className="card">
        <div className="mid with-ic">
          <Icon name="loan" /> {t.landLoan}
        </div>
        <p>{t.landLoanText}</p>
      </div>
      <div className="card warn">
        <div className="mid">{t.landStatusTitle}</div>
        <p>{t.landStatus}</p>
        <p className="muted">{t.landMadeUp}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sign in (mock OTP, code shown on screen)
function SignInScreen({ t, onDone, back }: { t: Dict; onDone: (s: SignIn) => void; back: () => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [e, setE] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (ph: string, c?: string) => {
    setE("");
    setBusy(true);
    try {
      const j = await api.signin(ph, c);
      if (c === undefined) setSent(true);
      else onDone({ key: j.key, address: j.address, phone: j.phone, name: j.name, nameTe: j.nameTe });
    } catch (x) {
      setE(errText(t, (x as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <button className="back" onClick={back}>
        ← {t.back}
      </button>
      <h1>{t.signInTitle}</h1>
      {e && (
        <div className="err" role="alert">
          {e}
        </div>
      )}
      <form
        onSubmit={(x) => {
          x.preventDefault();
          if (!sent) submit(phone);
          else submit(phone, code);
        }}
      >
        <div className="field">
          <label htmlFor="ph">{t.phoneLabel}</label>
          <input
            id="ph"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="98765 43210"
            value={phone}
            disabled={sent}
            onChange={(x) => setPhone(x.target.value)}
          />
        </div>
        {!sent ? (
          <button className="btn" type="submit" disabled={busy}>
            {busy ? t.working : t.sendCode}
          </button>
        ) : (
          <>
            <div className="otp-shown" aria-live="polite">
              {t.otpShown} <b className="mono">123456</b>
            </div>
            <div className="field">
              <label htmlFor="otp">{t.codeLabel}</label>
              <input id="otp" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(x) => setCode(x.target.value)} autoFocus />
              <p className="muted">{t.codeHint}</p>
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? t.working : t.verify}
            </button>
            <button
              className="back"
              type="button"
              onClick={() => {
                setSent(false);
                setCode("");
              }}
            >
              {t.changeNumber}
            </button>
          </>
        )}
      </form>
      <button className="btn demo" disabled={busy} onClick={() => submit("9876543210", "123456")}>
        {t.demoUser}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- waitlist
function Waitlist({ t, lang, back }: { t: Dict; lang: Lang; back: () => void }) {
  const [f, setF] = useState({ name: "", contact: "", city: "", interest: "", consent: false, updates: false, website: "" });
  const [msg, setMsg] = useState("");
  const [e, setE] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    setE("");
    // same rules as the server, so a mistake is shown at once without a request
    const check = validate({ ...f, lang });
    if (check.error && check.error !== "SPAM") {
      setE(errText(t, check.error));
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...f, lang }),
      });
      const j = await r.json().catch(() => ({ error: "STORE_DOWN" }));
      if (!r.ok || j.error) throw new Error(j.error || "STORE_DOWN");
      setMsg(j.added === false ? t.wlAlready : t.wlDone);
    } catch (x) {
      const m = (x as Error).message;
      setE(errText(t, m === "Failed to fetch" ? "OFFLINE" : m));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <button className="back" onClick={back}>
        ← {t.back}
      </button>
      <h1>{t.wlTitle}</h1>
      <p className="muted">{t.wlIntro}</p>
      {msg ? (
        <div className="card ok mid" role="status">
          ✓ {msg}
        </div>
      ) : (
        <form
          onSubmit={(x) => {
            x.preventDefault();
            submit();
          }}
        >
          {e && (
            <div className="err" role="alert">
              {e}
            </div>
          )}
          <div className="field">
            <label htmlFor="wl-name">{t.wlName}</label>
            <input id="wl-name" autoComplete="name" value={f.name} onChange={(x) => set("name", x.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="wl-contact">{t.wlContact}</label>
            <input id="wl-contact" autoComplete="tel" value={f.contact} onChange={(x) => set("contact", x.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="wl-city">{t.wlCity}</label>
            <input id="wl-city" autoComplete="address-level2" value={f.city} onChange={(x) => set("city", x.target.value)} />
          </div>
          <fieldset className="field choices">
            <legend>{t.wlInterest}</legend>
            {(
              [
                ["gold", t.wlGold],
                ["chits", t.wlChits],
                ["both", t.wlBoth],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className={"choice" + (f.interest === v ? " on" : "")}>
                <input type="radio" name="interest" value={v} checked={f.interest === v} onChange={() => set("interest", v)} />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="consent">
            <input type="checkbox" checked={f.consent} onChange={(x) => set("consent", x.target.checked)} />
            <span>{t.wlConsent}</span>
          </label>
          <label className="consent">
            <input type="checkbox" checked={f.updates} onChange={(x) => set("updates", x.target.checked)} />
            <span>{t.wlUpdates}</span>
          </label>
          {/* hidden from people; bots fill it */}
          <input
            className="hp"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            name="website"
            value={f.website}
            onChange={(x) => set("website", x.target.value)}
          />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? t.working : t.wlSubmit}
          </button>
        </form>
      )}
    </div>
  );
}
