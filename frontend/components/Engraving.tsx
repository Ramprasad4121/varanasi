// Author: Ramprasad — pure-SVG "engraving plates": the site's entire visual layer, zero bytes of raster.
import type { ReactNode } from "react";

/**
 * Engraving — line-art plates in the language of 18th-century arena
 * etchings. Every "photo" on this site is one of these: inline SVG,
 * currentColor strokes, hatched ground, no image requests at all (the repo
 * ships zero raster bytes and still out-draws a stock-photo site).
 */
export type EngravingVariant =
  | "arena"
  | "palace"
  | "scales"
  | "gate"
  | "scroll"
  | "trophy"
  | "eagle"
  | "figure"
  | "emblem"
  | "workshop"
  | "courtyard"
  | "hall";

const PLATES: Record<EngravingVariant, ReactNode> = {
  arena: (
    <>
      <ellipse cx="60" cy="62" rx="44" ry="26" />
      <ellipse cx="60" cy="62" rx="30" ry="16" />
      <ellipse cx="60" cy="62" rx="15" ry="7" />
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
        const a = (deg * Math.PI) / 180;
        const x1 = 60 + Math.cos(a) * 44;
        const y1 = 62 + Math.sin(a) * 26;
        const x2 = 60 + Math.cos(a) * 30;
        const y2 = 62 + Math.sin(a) * 16;
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      <path d="M22 96 L98 96" />
    </>
  ),
  palace: (
    <>
      <path d="M60 16 q-4 6 0 10 q4 -4 0 -10" />
      <path d="M36 44 a24 18 0 0 1 48 0 z" />
      <path d="M28 44 h64" />
      <path d="M24 52 h72 l-6 -8 h-60 z" />
      {[32, 44, 56, 68, 80, 88].map((x) => (
        <line key={x} x1={x} y1="56" x2={x} y2="84" />
      ))}
      <path d="M28 88 h64" />
      <path d="M24 94 h72" />
    </>
  ),
  scales: (
    <>
      <line x1="60" y1="24" x2="60" y2="86" />
      <line x1="30" y1="34" x2="90" y2="34" />
      <circle cx="60" cy="26" r="3" />
      <path d="M30 34 l-9 22 h18 z" />
      <path d="M21 56 a9 6 0 0 0 18 0" />
      <path d="M90 34 l-9 22 h18 z" />
      <path d="M81 56 a9 6 0 0 0 18 0" />
      <path d="M46 92 h28" />
      <path d="M50 86 l-4 6 M70 86 l4 6" />
    </>
  ),
  gate: (
    <>
      <path d="M20 92 V40 h80 v52" />
      <path d="M16 40 h88 l-8 -10 h-72 z" />
      <path d="M14 30 h92" />
      <path d="M48 92 V66 a12 12 0 0 1 24 0 v26" />
      <path d="M26 92 V78 a6 6 0 0 1 12 0 v14" />
      <path d="M82 92 V78 a6 6 0 0 1 12 0 v14" />
      <path d="M60 56 v-12" />
      <circle cx="60" cy="40" r="4" />
    </>
  ),
  scroll: (
    <>
      <path d="M28 36 h64 v48 h-64 z" />
      <circle cx="24" cy="36" r="5" />
      <circle cx="24" cy="84" r="5" />
      <circle cx="96" cy="36" r="5" />
      <circle cx="96" cy="84" r="5" />
      <path d="M36 48 h48 M36 58 h48 M36 68 h34" />
      <circle cx="82" cy="74" r="7" />
      <path d="M79 74 l2 3 l5 -6" />
    </>
  ),
  trophy: (
    <>
      <path d="M42 30 h36 v14 a18 18 0 0 1 -36 0 z" />
      <path d="M42 34 a-12 12 0 0 0 6 22 M78 34 a12 12 0 0 1 -6 22" />
      <line x1="60" y1="62" x2="60" y2="74" />
      <path d="M48 82 h24 l-4 -8 h-16 z" />
      <path d="M60 12 l2.6 5.4 5.9 .8 -4.3 4.1 1.1 5.9 -5.3 -2.8 -5.3 2.8 1.1 -5.9 -4.3 -4.1 5.9 -.8 z" />
    </>
  ),
  eagle: (
    <>
      <circle cx="60" cy="38" r="6" />
      <path d="M64 34 l6 -2" />
      <path d="M54 44 q-24 2 -34 22 q18 -8 32 -6" />
      <path d="M66 44 q24 2 34 22 q-18 -8 -32 -6" />
      <path d="M52 66 l8 16 8 -16" />
      <path d="M42 96 q18 -10 36 0" />
      <path d="M46 100 q14 -8 28 0" />
    </>
  ),
  figure: (
    <>
      <circle cx="56" cy="30" r="7" />
      <path d="M56 37 q-10 6 -12 34 l6 22 h12 l-2 -40" />
      <path d="M56 46 l16 -10" />
      <line x1="76" y1="18" x2="76" y2="86" />
      <path d="M76 18 h18 l-6 8 6 8 h-18 z" />
      <path d="M40 66 h-8 M42 76 h-8" />
    </>
  ),
  emblem: (
    <>
      <path d="M60 18 L102 60 L60 102 L18 60 Z" />
      <path d="M60 30 L90 60 L60 90 L30 60 Z" />
      <circle cx="60" cy="60" r="10" />
      <line x1="60" y1="46" x2="60" y2="74" />
      <line x1="46" y1="60" x2="74" y2="60" />
    </>
  ),
  workshop: (
    <>
      <path d="M18 52 h84 v10 h-84 z" />
      <path d="M24 62 l-6 32 M96 62 l6 32" />
      <path d="M34 44 v8 M46 40 v12 M58 44 v8" />
      <path d="M70 44 a10 10 0 0 1 20 0" />
      <line x1="70" y1="44" x2="78" y2="28" />
      <line x1="90" y1="44" x2="82" y2="28" />
      <circle cx="80" cy="26" r="2" />
    </>
  ),
  courtyard: (
    <>
      <path d="M14 40 h92" />
      <path d="M14 40 v6 M112 40 v6" />
      {[24, 48, 72, 96].map((x) => (
        <g key={x}>
          <line x1={x} y1="46" x2={x} y2="84" />
          <path d={`M${x - 8} 84 a8 8 0 0 1 16 0`} />
          <path d={`M${x - 8} 46 h16`} />
        </g>
      ))}
      <path d="M10 88 h100 M14 94 h92" />
    </>
  ),
  hall: (
    <>
      <path d="M24 30 v14 a12 12 0 0 1 24 0 v-14 z" />
      <path d="M72 30 v14 a12 12 0 0 1 24 0 v-14 z" />
      <path d="M18 56 h84 v8 h-84 z" />
      <path d="M24 64 v26 M96 64 v26" />
      <path d="M40 56 v-8 h6 v8 M57 56 v-10 h6 v10 M74 56 v-8 h6 v8" />
      <path d="M40 48 h6 M57 46 h6 M74 48 h6" />
    </>
  ),
};

export function Engraving({
  variant,
  className = "",
  title,
}: {
  variant: EngravingVariant;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      preserveAspectRatio="xMidYMid meet"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    >
      {PLATES[variant]}
    </svg>
  );
}

export default Engraving;
