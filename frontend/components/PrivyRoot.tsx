"use client";

// Author: Ramprasad — site-wide Privy: email / Google / GitHub / wallet + embedded Sepolia wallet.
import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export function PrivyRoot({ children }: { children: ReactNode }) {
  if (!APP_ID) return <>{children}</>;
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["email", "google", "github", "wallet"],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
