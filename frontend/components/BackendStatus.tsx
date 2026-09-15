"use client";

// Author: Ramprasad — live backend status pill (health + version, degrades quietly).
import { useEffect, useState } from "react";
import { getHealth, backendUrls } from "@/lib/backend";

export function BackendStatus() {
  const [label, setLabel] = useState("checking backend…");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getHealth().then((r) => {
      if (cancelled) return;
      if (r.ok && r.data.status === "ok") {
        setOk(true);
        setLabel(`${r.data.network === "hedera:mainnet" ? "mainnet" : "testnet"} · ${r.data.receiptsServed} receipts`);
      } else {
        setOk(false);
        setLabel("backend unreachable — demo values shown");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <a
      href={backendUrls.health()}
      target="_blank"
      rel="noreferrer"
      title="Signal service health"
      className={`font-label text-[11px] uppercase tracking-[0.12em] underline underline-offset-4 ${
        ok ? "text-accent" : "text-fg-muted"
      }`}
    >
      {ok ? "● " : "○ "}
      {label}
    </a>
  );
}

export default BackendStatus;
