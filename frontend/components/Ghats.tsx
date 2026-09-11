import React from "react";
import { cn } from "@/lib/utils";

/**
 * The ghats at night — stepped river banks, shikhara spires, lamp dots.
 * A silhouette strip for the hero base and the footer crown.
 * Pure SVG, no assets, scales to any width.
 */
export function GhatsSkyline({
  className,
  lamps = true,
  flip = false,
}: {
  className?: string;
  lamps?: boolean;
  flip?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 1440 240"
      preserveAspectRatio="xMidYMax slice"
      className={cn("block w-full", className)}
      aria-hidden="true"
      style={flip ? { transform: "scaleY(-1)" } : undefined}
    >
      {/* far bank — faint, behind the mist */}
      <path
        d="M0 214 L0 168 L60 168 L60 150 L120 150 L120 168 L200 168 L200 140 L235 140 L235 96 L243 96 L251 140 L286 140 L286 168 L360 168 L360 152 L420 152 L420 168 L520 168 L520 146 L560 146 L560 168 L640 168 L640 154 L700 154 L700 168 L780 168 L780 142 L820 142 L820 168 L900 168 L900 150 L960 150 L960 168 L1440 168 L1440 240 L0 240 Z"
        fill="#100c1f"
        opacity="0.85"
      />

      {/* main ghats — the lit steps */}
      <path
        d="M0 240 L0 208 L70 208 L70 196 L140 196 L140 182 L210 182 L210 196 L300 196 L300 208 L370 208
           L370 178 L430 178 L430 208 L560 208
           L560 160 L610 160 L616 148 L620 132 L628 148 L634 160 L690 160 L690 208
           L820 208 L820 186 L900 186 L900 208
           L1010 208 L1010 170 L1030 170 L1036 118 L1044 66 L1048 52 L1052 66 L1060 118 L1066 170 L1086 170 L1086 208
           L1180 208 L1180 190 L1250 190 L1250 206 L1320 206 L1320 192 L1440 192 L1440 240 Z"
        fill="#080612"
      />

      {/* gold edge along the steps */}
      <path
        d="M0 208 L70 208 L70 196 L140 196 L140 182 L210 182 L210 196 L300 196 L300 208 L370 208
           L370 178 L430 178 L430 208 L560 208 L560 160 L610 160 L616 148 L620 132 L628 148 L634 160 L690 160 L690 208
           L820 208 L820 186 L900 186 L900 208
           L1010 208 L1010 170 L1030 170 L1036 118 L1044 66 L1048 52 L1052 66 L1060 118 L1066 170 L1086 170 L1086 208
           L1180 208 L1180 190 L1250 190 L1250 206 L1320 206 L1320 192 L1440 192"
        fill="none"
        stroke="url(#varanasiGoldEdge)"
        strokeWidth="1.4"
      />

      {/* chhatri pavilion roofs on the far bank */}
      <g fill="#0d0a1a" stroke="rgba(217,179,106,0.28)" strokeWidth="1">
        <path d="M320 150 h36 l-18 -16 Z" />
        <path d="M940 132 h30 l-15 -13 Z" />
        <path d="M1300 146 h34 l-17 -15 Z" />
      </g>

      {/* lamps along the steps */}
      {lamps ? (
        <g fill="#ffb057">
          <circle className="lamp-dot" cx="90" cy="204" r="2" />
          <circle className="lamp-dot" cx="160" cy="192" r="2" />
          <circle className="lamp-dot" cx="238" cy="178" r="2" />
          <circle className="lamp-dot" cx="330" cy="192" r="2" />
          <circle className="lamp-dot" cx="470" cy="204" r="2" />
          <circle className="lamp-dot" cx="600" cy="156" r="2.2" />
          <circle className="lamp-dot" cx="660" cy="156" r="2" />
          <circle className="lamp-dot" cx="740" cy="204" r="2" />
          <circle className="lamp-dot" cx="860" cy="182" r="2" />
          <circle className="lamp-dot" cx="950" cy="204" r="2" />
          <circle className="lamp-dot" cx="1044" cy="112" r="2.2" />
          <circle className="lamp-dot" cx="1044" cy="62" r="1.8" />
          <circle className="lamp-dot" cx="1130" cy="204" r="2" />
          <circle className="lamp-dot" cx="1220" cy="186" r="2" />
          <circle className="lamp-dot" cx="1350" cy="188" r="2" />
        </g>
      ) : null}
    </svg>
  );
}
