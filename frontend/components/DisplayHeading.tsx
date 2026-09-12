import type { ReactNode } from "react";
import React from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
  size?: "hero" | "section" | "page";
};

export function DisplayHeading({ children, as: Tag = "h2", className, size = "section" }: Props) {
  return (
    <Tag
      className={cn(
        "font-display font-medium text-ink tracking-[-0.03em] leading-[1.02] text-balance",
        size === "hero" && "text-[clamp(3.1rem,7.4vw,6.1rem)]",
        size === "section" && "text-[clamp(2.1rem,4.2vw,3.4rem)]",
        size === "page" && "text-[clamp(2.6rem,5.4vw,4.4rem)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
