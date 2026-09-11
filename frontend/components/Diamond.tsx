import React from "react";
import { Flame } from "@/components/Flame";

export function Diamond({ className = "text-gold/50" }: { className?: string }) {
  return (
    <svg viewBox="0 0 9 9" width="9" height="9" aria-hidden="true" className={className}>
      <path fill="none" stroke="currentColor" strokeWidth="1" d="M8.293 4.5 4.5 8.293.707 4.5 4.5.707z" />
    </svg>
  );
}

export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span className={`${className} grid place-items-center`}>
      <Flame size={15} />
    </span>
  );
}
