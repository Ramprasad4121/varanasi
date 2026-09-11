import React from "react";
import { DisplayHeading } from "@/components/DisplayHeading";
import { Engraving, type EngravingVariant } from "@/components/Engraving";

export interface PageHeroProps {
  title: string;
  lede?: string;
  eyebrow?: string;
  subtitle?: string;
  plate?: EngravingVariant;
}

export function PageHero({ title, lede, eyebrow, subtitle, plate }: PageHeroProps) {
  const text = subtitle || lede;
  return (
    <header className="relative overflow-hidden border-b border-border bg-bg-muted/30">
      <div className="relative z-10 mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-[760px]">
            {eyebrow && (
              <p className="mb-2 font-label text-xs uppercase tracking-[0.16em] text-accent font-medium">
                {eyebrow}
              </p>
            )}
            <DisplayHeading as="h1" size="page">
              {title}
            </DisplayHeading>
            {text && (
              <p className="mt-3 max-w-[34rem] font-display text-lg italic leading-relaxed text-fg-body">
                {text}
              </p>
            )}
          </div>
          {plate && (
            <div className="shrink-0">
              <div className="relative w-28 h-28 sm:w-36 sm:h-36 border border-border bg-bg-muted/40 p-1.5 shadow-sm overflow-hidden text-ink">
                <Engraving variant={plate} className="h-full w-full opacity-85" />
              </div>
            </div>
          )}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-bg-muted/60 to-transparent"
      />
    </header>
  );
}

export default PageHero;
