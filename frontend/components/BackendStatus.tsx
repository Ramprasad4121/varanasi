"use client";

// Author: Ramprasad — live backend status pill (health + version, degrades quietly).
// Render free-plan instances sleep when idle: first contact can take 30s+.
// The pill retries with backoff and says so, instead of failing on one timeout.
import { useEffect, useState } from "react";
import { getHealth, backendUrls } from "@/lib/backend";

const HEALTH_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function BackendStatus() {
  const [label, setLabel] = useState("checking backend…");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function probe() {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (cancelled) return;
        if (attempt > 1) {
          setLabel(`waking backend… (attempt ${attempt}/${MAX_ATTEMPTS})`);
          await sleep(RETRY_DELAY_MS);
          if (cancelled) return;
        }
        const r = await getHealth(HEALTH_TIMEOUT_MS);
        if (cancelled) return;
        if (r.ok && r.data.status === "ok") {
          setOk(true);
          setLabel(
            `${r.data.network === "hedera:mainnet" ? "mainnet" : "testnet"} · ${r.data.receiptsServed} receipts`,
          );
          return;
        }
      }
      if (!cancelled) {
        setOk(false);
        setLabel("backend unreachable — demo values shown");
      }
    }
    probe();
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
