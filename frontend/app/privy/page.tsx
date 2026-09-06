"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import Treasury from "./treasury";

// App ID is public (Privy dashboard) but gates the whole route: without it we
// render setup instructions and never mount the SDK — no crash, no spinner.
const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export default function PrivyPage() {
  if (!APP_ID) return <SetupNotice />;
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        // Email + socials first (judge-friendly), external wallet as fallback.
        loginMethods: ["email", "google", "github", "wallet"],
        // Self-custodial embedded wallet auto-created on login for users
        // without one; user owns keys via Privy recovery (email/passkey).
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <Treasury />
    </PrivyProvider>
  );
}

function SetupNotice() {
  return (
    <section className="panel">
      <h2>Privy treasury — setup required</h2>
      <p className="desc">
        This route needs a Privy App ID. It renders nothing from the SDK until one is set, so the
        rest of the app is unaffected.
      </p>
      <ol>
        <li>
          Create an app at <code>dashboard.privy.io</code> (see <code>frontend/PRIVY.md</code>).
        </li>
        <li>
          <code>npm install @privy-io/react-auth</code> in <code>frontend/</code>.
        </li>
        <li>
          Copy <code>.env.example</code> → <code>.env.local</code> and set{" "}
          <code>NEXT_PUBLIC_PRIVY_APP_ID</code>, then restart <code>npm run dev</code>.
        </li>
      </ol>
      <p className="envline">
        <a href="/">← Back to the varanasi dashboard</a>
      </p>
    </section>
  );
}
