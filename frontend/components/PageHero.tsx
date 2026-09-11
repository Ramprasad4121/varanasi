import React from "react";
import { Flame } from "@/components/Flame";

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
    <section className="relative overflow-hidden border-b border-border">
      {/* jaali lattice + a distant lamp glow */}
      <div className="jaali-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(640px 300px at 82% -20%, rgba(255,148,50,0.10), transparent 65%), radial-gradient(520px 260px at 8% 120%, rgba(96,78,150,0.12), transparent 60%)",
        }}
      />

      <div className="relative mx-auto max-w-[1200px] px-4 pb-12 pt-16 sm:px-6 sm:pb-14 sm:pt-20">
        {eyebrow ? (
          <p className="flex items-center gap-3 font-label text-[11px] uppercase tracking-[0.24em] text-gold/80">
            <Flame size={11} withHalo={false} />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-4 max-w-[24ch] font-display text-[clamp(2.6rem,5.4vw,4.4rem)] font-medium leading-[1.02] tracking-[-0.03em] text-ink text-balance">
          {title}
        </h1>
        {text ? (
          <p className="mt-5 max-w-[44rem] font-display text-[1.2rem] italic leading-relaxed text-fg-body">{text}</p>
        ) : null}
      </div>

      {image ? (
        <div className="relative">
          <div
            className="h-40 w-full object-cover opacity-55 sm:h-52"
            style={{
              backgroundImage: `url(${image})`,
              backgroundSize: "cover",
              backgroundPosition: "center 60%",
              maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.9), transparent 96%)",
              WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.9), transparent 96%)",
            }}
            aria-hidden="true"
          />
          <div className="gold-hairline absolute inset-x-0 bottom-0" aria-hidden="true" />
        </div>
      ) : null}
    </section>
  );
}
