"use client";

// Author: Ramprasad — nav identity chip. Nothing while Privy is resolving (no sign-in flash).
import { usePrivy } from "@privy-io/react-auth";

const HAS_PRIVY = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export function AuthSlot() {
  if (!HAS_PRIVY) {
    return (
      <a className="nav-signin" href="/account">
        Sign in
      </a>
    );
  }
  return <AuthSlotInner />;
}

function AuthSlotInner() {
  const { ready, authenticated, login, user } = usePrivy();
  if (!ready) return <span className="auth-skel" aria-hidden="true" />;
  if (!authenticated) {
    return (
      <button type="button" className="nav-signin" onClick={() => login()}>
        Sign in
      </button>
    );
  }
  const label =
    user?.email?.address ??
    user?.google?.email ??
    user?.github?.username ??
    "Account";
  const short = label.includes("@") ? label.split("@")[0] : label;
  return (
    <a className="nav-account" href="/account" title={label}>
      {short}
    </a>
  );
}
