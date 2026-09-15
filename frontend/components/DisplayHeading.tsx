import type { ReactNode } from "react";
import React from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
  size?: "hero" | "section" | "page";
};

/**
 * Author: Ramprasad — clean display heading, colosseum grammar.
 * Serif only, tight tracking, balanced wrapping. No drop-caps.
 */
export function DisplayHeading({ children, as: Tag = "h2", className, size = "section" }: Props) {
  return (
    <Tag
      className={cn(
        "font-display font-medium text-ink tracking-[-0.02em] leading-[1.08] text-balance",
        size === "hero" && "text-[clamp(2.5rem,5vw,4rem)]",
        size === "section" && "text-[clamp(1.9rem,3.6vw,2.9rem)]",
        size === "page" && "text-[clamp(2.4rem,5vw,3.9rem)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
