import React from "react";
import { cn } from "@/lib/utils";
import type { SoldierHelm, SoldierPose, SoldierTone, SoldierWeapon } from "@/lib/legion";

type Props = {
  helm: SoldierHelm;
  weapon: SoldierWeapon;
  pose: SoldierPose;
  tone: SoldierTone;
  emblem: string;
  className?: string;
};

const TONE_STROKE: Record<SoldierTone, string> = {
  accent: "text-accent",
  leaf: "text-ok",
  ink: "text-ink",
  amber: "text-warn",
};

function Crest({ kind }: { kind: SoldierHelm }) {
  if (kind === "pilos") {
    return (
      <path
        d="M58 20 Q64 8 70 20 Q64 24 58 20"
        strokeWidth="2.4"
        fill="currentColor"
        stroke="none"
      />
    );
  }
  if (kind === "attican") {
    return (
      <path
        d="M55 12 Q64 2 73 12 L70 14 Q64 8 58 14 Z"
        strokeWidth="2.2"
        fill="currentColor"
        stroke="none"
      />
    );
  }
  // corinthian: tall horsehair crest
  return (
    <path
      d="M50 14 Q56 2 72 8 Q76 12 72 18 Q62 10 50 14"
      strokeWidth="2.2"
      fill="currentColor"
      stroke="none"
    />
  );
}

function Weapon({ kind }: { kind: SoldierWeapon }) {
  switch (kind) {
    case "spear":
      return (
        <g>
          <path d="M84 98 L84 30" strokeWidth="1.8" />
          <path d="M84 30 L76 40 L92 40 Z" fill="currentColor" stroke="none" />
        </g>
      );
    case "sword": {
      return (
        <g>
          <path d="M88 98 L88 46" strokeWidth="1.8" />
          <path d="M88 40 L84 46 L92 46 Z" fill="currentColor" stroke="none" />
          <path d="M81 50 L95 50" strokeWidth="2.2" />
          <path d="M80 52 L80 58 L96 58 L96 52" strokeWidth="1.6" />
        </g>
      );
    }
    case "torch": {
      return (
        <g>
          <path d="M86 98 L86 52" strokeWidth="1.8" />
          <path d="M80 52 Q86 30 92 52 Z" fill="currentColor" stroke="none" />
          <path d="M86 44 L86 34" strokeWidth="1.6" />
        </g>
      );
    }
    case "scales": {
      return (
        <g>
          <path d="M86 98 L86 50" strokeWidth="1.8" />
          <path d="M72 50 L100 50" strokeWidth="2.2" />
          <path d="M74 50 L70 66 M98 50 L102 66" strokeWidth="1.6" />
          <path d="M78 66 Q74 74 78 82 M76 70 L82 82" strokeWidth="1.5" />
          <path d="M94 66 Q98 74 94 82 M92 70 L98 82" strokeWidth="1.5" />
        </g>
      );
    }
    case "banner": {
      return (
        <g>
          <path d="M86 98 L86 40" strokeWidth="1.8" />
          <path d="M86 40 L108 46 L86 52" fill="currentColor" stroke="none" />
        </g>
      );
    }
    case "bow": {
      return (
        <g>
          <path d="M84 40 Q72 70 88 98" strokeWidth="1.8" />
          <path d="M84 40 L80 46 L88 48 L84 40 Z" fill="currentColor" stroke="none" />
          <path d="M78 44 Q82 58 92 52" strokeWidth="1.2" />
        </g>
      );
    }
  }
}

/**
 * Procedural Greek hoplite plate — line art rendered from tokens so it is
 * safe in both light and dark themes. Helm, weapon, pose, tone, and shield
 * emblem make every legionnaire distinct.
 */
export function SoldierPlate({ helm, weapon, pose, tone, emblem, className }: Props) {
  const tilt = pose === "scout" ? "-rotate-6" : pose === "scribe" ? "rotate-3" : "";
  return (
    <svg
      viewBox="0 0 128 176"
      role="img"
      aria-hidden="true"
      className={cn("h-full w-full", TONE_STROKE[tone], className)}
    >
      {/* ground baseline */}
      <path
        d="M24 152 L104 152"
        strokeWidth="1.2"
        className="text-fg-muted"
        stroke="currentColor"
        fill="none"
      />
      <g
        transform={pose === "guard" ? "" : `translate(4, ${pose === "scribe" ? 14 : 10})`}
      >
      <g className={tilt}>
        {/* shield (far side) */}
        <circle cx="42" cy="92" r="24" strokeWidth="2" fill="none" />
        <circle cx="42" cy="92" r="17" strokeWidth="1.4" className="text-fg-muted" />
        <text
          x="42"
          y="99"
          textAnchor="middle"
          fontSize="17"
          fill="currentColor"
          className="font-label"
        >
          {emblem}
        </text>

        {/* far leg behind shield */}
        <path d="M48 96 L54 132 L62 150 M50 118 L62 120" strokeWidth="2" />

        {/* torso — linothorax */}
        <path d="M46 96 L46 60 Q46 44 64 44 Q82 44 82 60 L82 96 Z" strokeWidth="2" />
        <path d="M46 72 L82 72 M46 84 L82 84 M50 58 L78 58" strokeWidth="1.2" className="text-fg-muted" />

        {/* neck + helm */}
        <path d="M58 46 L60 54 M70 46 L68 54" strokeWidth="2" />
        <path d="M52 46 Q64 30 76 46 Z" strokeWidth="2" />
        <path d="M50 46 L52 52 L52 58 M78 46 L76 52 L76 58" strokeWidth="1.8" />
        <g className="text-accent">
          <Crest kind={helm} />
        </g>

        {/* near arm + weapon */}
        <path d="M80 52 L90 66 L86 92" strokeWidth="2" />
        <path d="M82 96 L84 102 L88 98 L84 94 Z" strokeWidth="1.4" />
        <Weapon kind={weapon} />

        {/* far arm to shield */}
        <path d="M46 58 L44 74 L42 82" strokeWidth="1.6" />

        {/* near leg */}
        <path d="M66 96 L74 130 L70 150" strokeWidth="2" />
        <path d="M64 118 L76 118" strokeWidth="1.4" className="text-fg-muted" />

        {/* feet */}
        <path d="M56 150 L66 150 M66 150 L72 152" strokeWidth="2" />
      </g>
      </g>
    </svg>
  );
}

export default SoldierPlate;