import Link from "next/link";
import type { ComponentProps } from "react";
import React from "react";
import { cn } from "@/lib/utils";

// Author: Ramprasad — clean minimal buttons. Primary = solid accent,
// ghost = outline, quiet = soft fill. Rounded 8px, 48px height.
const styles = {
  primary: "bg-accent text-white border border-accent hover:bg-accent-strong hover:border-accent-strong focus-visible:outline-accent",
  ghost: "bg-transparent text-ink border border-border-strong hover:border-ink hover:bg-bg-hover focus-visible:outline-accent",
  quiet: "bg-bg-muted text-fg hover:bg-bg-hover border border-transparent focus-visible:outline-accent",
};

type Shared = {
  children: React.ReactNode;
  className?: string;
  variant?: keyof typeof styles;
};

type LinkProps = Shared & {
  href?: string;
  target?: string;
  rel?: string;
};

type ButtonProps = Shared &
  Omit<ComponentProps<"button">, "className" | "children"> & {
    href?: never;
  };

const base =
  "inline-flex h-12 items-center justify-center rounded-lg px-6 m-0 font-sans text-[14px] font-semibold tracking-[0.01em] transition-[color,background-color,border-color,box-shadow] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

export function BrandButton(props: LinkProps | ButtonProps) {
  const { children, className, variant = "primary" } = props;
  const cls = cn(base, styles[variant], className);

  const destination = props.href;
  if (destination) {
    const isExternal = destination.startsWith("http") || destination.startsWith("//");
    const finalUrl = destination;

    if (isExternal) {
      return (
        <a href={finalUrl} className={cls} target={props.target ?? "_blank"} rel={props.rel ?? "noreferrer"}>
          {children}
        </a>
      );
    }
    return (
      <Link href={finalUrl} className={cls} target={props.target} rel={props.rel}>
        {children}
      </Link>
    );
  }

  const buttonProps = props as ButtonProps;
  return (
    <button
      type={buttonProps.type ?? "button"}
      className={cls}
      onClick={buttonProps.onClick}
      disabled={buttonProps.disabled}
    >
      {children}
    </button>
  );
}
