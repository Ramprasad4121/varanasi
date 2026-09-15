import React from "react";
import { DisplayHeading } from "@/components/DisplayHeading";

export interface PageHeroProps {
  title: string;
  lede?: string;
  eyebrow?: string;
  subtitle?: string;
  /** @deprecated imagery removed in the minimal rebuild — accepted and ignored. */
  image?: string;
  /** @deprecated drop-caps removed — accepted and ignored. */
  initial?: boolean;
}

// Author: Ramprasad — clean minimal page hero, colosseum grammar.
// Centered eyebrow + serif title + one-line lede. No imagery.
export function PageHero({ title, lede, eyebrow, subtitle }: PageHeroProps) {
  const text = subtitle || lede;
  return (
    <header className="border-b border-border bg-bg">
      <div className="mx-auto max-w-[880px] px-4 py-14 text-center sm:px-6 sm:py-20">
        {eyebrow && (
          <p className="mb-4 font-label text-[11px] uppercase tracking-[0.18em] text-accent font-medium">
            {eyebrow}
          </p>
        )}
        <DisplayHeading as="h1" size="page">
          {title}
        </DisplayHeading>
        {text && (
          <p className="mx-auto mt-5 max-w-[36rem] font-sans text-[17px] leading-relaxed text-fg-body">
            {text}
          </p>
        )}
      </div>
    </header>
  );
}

export default PageHero;
