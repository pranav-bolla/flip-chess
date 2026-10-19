"use client";

import { MotionConfig, useReducedMotion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { effectiveMotion, usePrefs } from "@/lib/client/prefs";
import { getController } from "@/lib/client/game-store";
import { SettingsDialog } from "./SettingsDialog";
import type { MotionPref } from "@/lib/storage/storage";

interface AppContextValue {
  openSettings: () => void;
  motion: MotionPref;
}

const AppContext = createContext<AppContextValue>({ openSettings: () => {}, motion: "full" });
export const useApp = () => useContext(AppContext);

/** Flip and move timings per motion level. Flip stays a deliberate beat even with motion off. */
export const TIMINGS: Record<MotionPref, { flipMs: number; moveSettleMs: number }> = {
  full: { flipMs: 1100, moveSettleMs: 200 },
  reduced: { flipMs: 900, moveSettleMs: 100 },
  off: { flipMs: 700, moveSettleMs: 40 },
};

export function AppProvider({ children }: { children: ReactNode }) {
  const prefs = usePrefs();
  const osReduced = useReducedMotion();
  const motion = effectiveMotion(prefs.motion, osReduced);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    getController().setTiming(TIMINGS[motion]);
  }, [motion]);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const value = useMemo(() => ({ openSettings, motion }), [openSettings, motion]);

  return (
    <AppContext.Provider value={value}>
      <MotionConfig reducedMotion={motion === "full" ? "never" : "always"}>
        {children}
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </MotionConfig>
    </AppContext.Provider>
  );
}
