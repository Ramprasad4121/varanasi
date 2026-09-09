"use client";

// Author: Ramprasad — treasury route. PrivyProvider lives in the layout; this page only renders the dashboard.
import Treasury from "./treasury";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export default function PrivyPage() {
  if (!APP_ID) return <SetupNotice />;
  return <Treasury />;
}

function SetupNotice() {
  return (
    <section className="panel">
      <h2>Treasury — setup required</h2>
      <p className="desc">
        Sign-in and the embedded wallet need a Privy App ID. The rest of the site still works.
      </p>
      <ol>
        <li>
          Create an app at <code>dashboard.privy.io</code> (see <code>frontend/PRIVY.md</code>).
        </li>
        <li>
          Copy <code>.env.example</code> → <code>.env.local</code> and set{" "}
          <code>NEXT_PUBLIC_PRIVY_APP_ID</code>, then restart.
        </li>
      </ol>
      <p className="envline">
        <a href="/">← Back to varanasi</a>
      </p>
    </section>
  );
}
