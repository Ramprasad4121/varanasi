import React from "react";

// Author: Ramprasad — colosseum diamond divider: hairline, diamond, hairline.
export function SectionSep({ className = "my-16 sm:my-24" }: { className?: string }) {
  return (
    <div className={`mx-auto flex max-w-[1200px] items-center gap-4 px-4 sm:px-6 ${className}`} aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="select-none font-sans text-[10px] text-fg-muted">◆</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
