import React from "react";
import { Flame } from "@/components/Flame";

export function SectionSep({
  className = "my-16 sm:my-20",
  label,
  deva,
}: {
  className?: string;
  label?: string;
  deva?: string;
}) {
  return (
    <div
      className={`mx-auto flex max-w-[1200px] items-center gap-3.5 px-4 sm:px-6 ${className}`}
      aria-hidden={label ? undefined : true}
    >
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/40 to-gold/25" />
      <Flame size={12} withHalo={false} />
      {label ? (
        <span className="font-label text-[10px] uppercase tracking-[0.22em] text-gold/80 select-none">{label}</span>
      ) : null}
      {deva ? <span className="devanagari text-sm text-gold/60 select-none">{deva}</span> : null}
      <Flame size={12} withHalo={false} />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-gold/40 to-gold/25" />
    </div>
  );
}
