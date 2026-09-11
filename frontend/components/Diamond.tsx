import React from "react";
import { Engraving } from "@/components/Engraving";

export function Diamond({ className = "text-border-strong" }: { className?: string }) {
  return (
    <svg viewBox="0 0 9 9" width="9" height="9" aria-hidden="true" className={className}>
      <path fill="none" stroke="currentColor" strokeWidth="1" d="M8.293 4.5 4.5 8.293.707 4.5 4.5.707z" />
    </svg>
  );
}

export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return <Engraving variant="emblem" className={`${className} text-ink`} title="Varanasi emblem" />;
}
