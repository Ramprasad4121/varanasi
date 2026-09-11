import React from "react";
import { cn } from "@/lib/utils";

/**
 * The diya flame — varanasi's mark.
 * A still lamp on the river; light offered before the money moves.
 * Gradient defs live once in SiteShell (`flameDefs`) so every flame
 * on the page shares them.
 */
export function Flame({
  size = 28,
  className,
  withHalo = true,
}: {
  size?: number;
  className?: string;
  withHalo?: boolean;
}) {
  const w = size;
  const h = Math.round(size * 1.32);
  return (
    <span
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: w, height: h }}
      aria-hidden="true"
    >
      {withHalo ? <span className="flame-halo" /> : null}
      <svg viewBox="0 0 24 32" width={w} height={h} fill="none">
        {/* outer tongue */}
        <path
          className="flame-outer"
          d="M12 1.2c2.9 5 7.6 7.7 7.6 13.2 0 4.6-3.4 8-7.6 8s-7.6-3.4-7.6-8C4.4 8.9 9.1 6.2 12 1.2Z"
          fill="url(#varanasiFlameOuter)"
        />
        {/* inner tongue */}
        <path
          className="flame-inner"
          d="M12 11.4c1.5 2.6 3.8 4 3.8 6.9 0 2.4-1.7 4.3-3.8 4.3s-3.8-1.9-3.8-4.3c0-2.9 2.3-4.3 3.8-6.9Z"
          fill="url(#varanasiFlameInner)"
        />
      </svg>
    </span>
  );
}

/**
 * Shared gradient defs for every Flame on the page. Rendered once,
 * invisibly, inside SiteShell.
 */
export function FlameDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <defs>
        <linearGradient id="varanasiFlameOuter" x1="12" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffd9a0" />
          <stop offset="55%" stopColor="#ff9432" />
          <stop offset="100%" stopColor="#e85d10" />
        </linearGradient>
        <linearGradient id="varanasiFlameInner" x1="12" y1="11" x2="12" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff6e0" />
          <stop offset="100%" stopColor="#ffc165" />
        </linearGradient>
        <linearGradient id="varanasiGoldEdge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(217,179,106,0)" />
          <stop offset="50%" stopColor="rgba(217,179,106,0.8)" />
          <stop offset="100%" stopColor="rgba(217,179,106,0)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
