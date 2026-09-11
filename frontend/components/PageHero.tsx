import React from "react";
import { DisplayHeading } from "@/components/DisplayHeading";

export interface PageHeroProps {
  title: string;
  lede?: string;
  eyebrow?: string;
  subtitle?: string;
  image?: string;
}

export function PageHero({ title, lede, eyebrow, subtitle, image }: PageHeroProps) {
  const text = subtitle || lede;
  return (
    <header className="relative overflow-hidden border-b border-border bg-bg-muted/30">
      <div className="relative z-10 mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          <div className="max-w-[760px]">
            {eyebrow && (
              <p className="mb-3 font-label text-xs uppercase tracking-[0.16em] text-accent font-medium">
                {eyebrow}
              </p>
            )}
            <DisplayHeading as="h1" size="page">
              {title}
            </DisplayHeading>
            {text && (
              <p className="mt-4 max-w-[34rem] font-display text-xl italic leading-relaxed text-fg-body">
                {text}
              </p>
            )}
          </div>
          {image && (
            <div className="shrink-0">
              <div className="relative w-36 h-36 sm:w-44 sm:h-44 border border-border bg-bg p-2 shadow-sm">
                <img
                  src={image}
                  alt=""
                  className="w-full h-full object-cover mix-blend-multiply grayscale contrast-125 opacity-90"
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg-muted/80 to-transparent"
      />
    </header>
  );
}

export default PageHero;
