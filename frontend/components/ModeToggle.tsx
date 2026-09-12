"use client";
// Author: Ramprasad — Humans/Agents segmented control (header).

import React from "react";
import { cn } from "@/lib/utils";
import { useMode, type Mode } from "@/components/mode";

export function ModeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useMode();
  const opts: Array<{ id: Mode; label: string }> = [
    { id: "human", label: "Humans" },
    { id: "agent", label: "Agents" },
  ];
  return (
    <div
      role="group"
      aria-label="Who is using the site"
      className={cn("flex items-center border border-border bg-bg-muted p-0.5", className)}
    >
      {opts.map((o) => {
        const active = mode === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setMode(o.id)}
            aria-pressed={active}
            className={cn(
              "px-3 font-label text-[10px] uppercase tracking-[0.14em] transition-colors",
              "h-8",
              active
                ? "bg-accent text-on-accent font-bold"
                : "text-fg-muted hover:text-fg"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default ModeToggle;