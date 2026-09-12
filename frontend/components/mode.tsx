"use client";
// Author: Ramprasad — Humans/Agents persona mode. Persisted in localStorage as
// `varanasi_mode`; flips copy, nav emphasis, and CTAs site-wide via useMode().

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Mode = "human" | "agent";

export const MODE_KEY = "varanasi_mode";

export function readMode(): Mode {
  if (typeof window === "undefined") return "human";
  try {
    const raw = window.localStorage.getItem(MODE_KEY);
    return raw === "agent" ? "agent" : "human";
  } catch {
    return "human";
  }
}

const ModeContext = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({
  mode: "human",
  setMode: () => {},
});

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>("human");

  useEffect(() => {
    const m = readMode();
    setModeState(m);
    document.documentElement.setAttribute("data-mode", m);
  }, []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(MODE_KEY, m);
    } catch {
      /* private mode: okay */
    }
    document.documentElement.setAttribute("data-mode", m);
  }, []);

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export function useMode() {
  return useContext(ModeContext);
}