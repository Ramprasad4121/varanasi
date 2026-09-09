"use client";

// Author: Ramprasad — account vault: identity, embedded wallet, hires, listed agents. Never stores keys.
import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { LS_AGENTS, sepoliaAddress, type AgentRecord } from "../../components/aegis";
import { HAS_PRIVY, LS_TASKS, loadScoped, type HireRecord } from "../../lib/vault";

export default function AccountPage() {
  if (!HAS_PRIVY) return <SetupNotice />;
  return <AccountInner />;
}

function SetupNotice() {
  return (
    <section className="wrap account-page">
      <p className="hero-kicker">Your vault</p>
      <h1>
        <span className="drop-cap" aria-hidden="true">
          S
        </span>
        ign in to keep your assets
      </h1>
      <p className="lede">
        Varanasi uses Privy so a community member can sign in with email, Google, GitHub, or a
        wallet — and get a self-custodial Sepolia wallet without installing MetaMask.
      </p>
      <ol className="account-setup">
        <li>
          Create an app at <code>dashboard.privy.io</code>.
        </li>
        <li>
          Enable email, Google, GitHub, and wallet login. Allow this site’s origin.
        </li>
        <li>
          Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> in <code>frontend/.env.local</code> and restart.
        </li>
      </ol>
      <p>
        Full notes: <a href="https://github.com/Ramprasad4121/varanasi/blob/main/frontend/PRIVY.md">frontend/PRIVY.md</a>
      </p>
    </section>
  );
}

function AccountInner() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const userId = authenticated ? user?.id : undefined;
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [hires, setHires] = useState<HireRecord[]>([]);

  useEffect(() => {
    if (!userId) {
      setAgents([]);
      setHires([]);
      return;
    }
    setAgents(loadScoped<AgentRecord[]>(userId, LS_AGENTS, []));
    setHires(loadScoped<HireRecord[]>(userId, LS_TASKS, []));
  }, [userId]);

  if (!ready) {
    return (
      <section className="wrap account-page">
        <div className="auth-skel" style={{ width: 240, height: 28 }} />
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className="wrap account-page">
        <p className="hero-kicker">Your vault</p>
        <h1>
          <span className="drop-cap" aria-hidden="true">
            S
          </span>
          ign in to keep your vault
        </h1>
        <p className="lede">
          Email, Google, GitHub, or a wallet you already have. An embedded Sepolia wallet is created
          for you. We never store private keys.
        </p>
        <button type="button" className="btn-solid" onClick={() => login()}>
          Sign in
        </button>
      </section>
    );
  }

  const identity =
    user?.email?.address ??
    user?.google?.email ??
    user?.github?.username ??
    user?.wallet?.address ??
    "Member";
  const method = user?.google
    ? "Google"
    : user?.github
      ? "GitHub"
      : user?.email
        ? "Email"
        : user?.wallet
          ? "Wallet"
          : "Privy";
  const address = wallet?.address ?? user?.wallet?.address ?? "";

  return (
    <section className="wrap account-page">
      <p className="hero-kicker">Your vault</p>
      <h1>
        <span className="drop-cap" aria-hidden="true">
          K
        </span>
        ept with the account. Never the keys.
      </h1>
      <p className="lede">
        Hires and listed agents follow this identity across browsers. The embedded wallet signs
        mandates. Varanasi never holds the private key.
      </p>

      <div className="account-grid">
        <article className="card">
          <p className="hero-kicker">Identity</p>
          <h2>{identity}</h2>
          <p className="muted">Signed in with {method}</p>
          <div className="row" style={{ marginTop: 16, gap: 8 }}>
            <a className="btn-outline" href="/#hire-wizard">
              Hire an agent
            </a>
            <button type="button" className="btn-outline" onClick={() => logout()}>
              Sign out
            </button>
          </div>
        </article>

        <article className="card">
          <p className="hero-kicker">Treasury wallet</p>
          <h2>Embedded Sepolia</h2>
          {address ? (
            <>
              <p>
                <code>{address}</code>
              </p>
              <a href={sepoliaAddress(address)} target="_blank" rel="noreferrer">
                View on Etherscan ↗
              </a>
            </>
          ) : (
            <p className="muted">Wallet is being created — refresh in a moment.</p>
          )}
          <p className="muted" style={{ marginTop: 12 }}>
            Fund this address from a Sepolia faucet before a live hire. Or connect an external
            wallet at sign-in.
          </p>
          <a className="btn-outline" href="/privy" style={{ marginTop: 16 }}>
            Open treasury
          </a>
        </article>
      </div>

      <article className="card" style={{ marginTop: 20 }}>
        <p className="hero-kicker">Hires</p>
        <h2>Mandates in this vault</h2>
        {hires.length === 0 ? (
          <p className="muted">No hires yet. Authorize a mandate and it lands here.</p>
        ) : (
          <ul className="account-list">
            {hires.map((task) => (
              <li key={task.id}>
                <div>
                  <strong>{task.agent}</strong>
                  <span className="muted">
                    {" "}
                    · {task.cap} vUSD · {shortAddr(task.id)}
                  </span>
                </div>
                <span className={`badge ${task.status === "released" ? "ok" : "warn"}`}>
                  {task.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="card" style={{ marginTop: 20 }}>
        <p className="hero-kicker">Agents</p>
        <h2>Identities you listed</h2>
        {agents.length === 0 ? (
          <p className="muted">No listed agents yet.</p>
        ) : (
          <ul className="account-list">
            {agents.map((agent) => (
              <li key={agent.sublabel}>
                <div>
                  <strong>{agent.sublabel}.aegis.eth</strong>
                  <span className="muted"> · {shortAddr(agent.wallet)}</span>
                </div>
                <span className={`badge ${agent.revoked ? "bad" : agent.pending ? "warn" : "ok"}`}>
                  {agent.revoked ? "revoked" : agent.pending ? "pending" : "authorized"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}

function shortAddr(value: string) {
  if (value.startsWith("0x") && value.length > 12) return `${value.slice(0, 6)}…${value.slice(-4)}`;
  return value;
}
