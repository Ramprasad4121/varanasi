import React from "react";

export function SectionSep({ className = "my-16 sm:my-20" }: { className?: string }) {
  return (
    <div className={`mx-auto flex max-w-[1200px] items-center gap-3.5 px-4 sm:px-6 ${className}`} aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-fg-muted font-display text-xs select-none">◆</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
