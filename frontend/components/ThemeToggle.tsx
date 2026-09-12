"use client";
// Author: Ramprasad — theme toggle. Persists a `varanasi_theme` cookie; the
// no-FOUC head script in layout.tsx applies it before first paint.

import React, { useCallback, useEffect, useState } from "react";

const THEME_KEY = "varanasi_theme";
const LIGHT = "light";
const DARK = "dark";

function systemTheme(): "light" | "dark" {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return DARK;
  }
  return LIGHT;
}

function readCookie(): "light" | "dark" | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split(";").find((c) => c.trim().startsWith(`${THEME_KEY}=`));
  if (!match) return null;
  const v = match.split("=")[1]?.trim();
  return v === DARK ? DARK : v === LIGHT ? LIGHT : null;
}

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  document.cookie = `${THEME_KEY}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === DARK ? "#151411" : "#f3f2ee");
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const current = readCookie() ?? systemTheme();
    applyTheme(current);
    setTheme(current);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === DARK ? LIGHT : DARK;
      applyTheme(next);
      return next;
    });
  }, []);

  if (theme === null) {
    return (
      <span
        aria-hidden="true"
        className={`inline-grid h-11 w-11 place-items-center border border-border font-label text-sm text-fg-muted ${className ?? ""}`}
      >
        ·
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === DARK ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === DARK ? "Switch to light theme" : "Switch to dark theme"}
      className={`group inline-grid h-11 w-11 place-items-center border border-border font-label text-sm transition-colors hover:border-accent hover:text-accent ${className ?? ""}`}
    >
      {theme === DARK ? (
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <circle cx="8" cy="8" r="3.2" />
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M13.1 2.9l-1.4 1.4M4.3 11.7l-1.4 1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <path d="M13.5 9.5A5.8 5.8 0 0 1 6.5 2.5a5.8 5.8 0 1 0 7 7Z" />
        </svg>
      )}
    </button>
  );
}