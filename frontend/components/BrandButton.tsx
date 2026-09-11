import Link from "next/link";
import type { ComponentProps } from "react";
import React from "react";
import { cn } from "@/lib/utils";

const styles = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong focus-visible:outline-accent",
  ghost: "bg-transparent text-ink border border-ink/80 hover:bg-ink hover:text-bg focus-visible:outline-accent",
  quiet: "bg-bg-muted text-fg hover:bg-bg-hover focus-visible:outline-accent",
};

type Shared = {
  children: React.ReactNode;
  className?: string;
  variant?: keyof typeof styles;
};

type LinkProps = Shared & {
  href?: string;
  to?: string;
  search?: Record<string, string>;
  target?: string;
  rel?: string;
};

type ButtonProps = Shared &
  Omit<ComponentProps<"button">, "className" | "children"> & {
    href?: never;
    to?: never;
    search?: never;
  };

const base =
  "inline-flex h-12 items-center justify-center rounded-none px-6 font-label text-[12px] font-medium uppercase tracking-[0.16em] transition-[color,background-color,border-color] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

export function BrandButton(props: LinkProps | ButtonProps) {
  const { children, className, variant = "primary" } = props;
  const cls = cn(base, styles[variant], className);

  const destination = props.to || props.href;
  if (destination) {
    const isExternal = destination.startsWith("http") || destination.startsWith("//");
    let finalUrl = destination;
    if (props.search && Object.keys(props.search).length > 0) {
      const sp = new URLSearchParams(props.search).toString();
      finalUrl = `${destination}?${sp}`;
    }

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
