"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Preferences } from "../storage/storage";
import { setSoundEnabled } from "../audio/sound";

let prefs: Preferences | null = null;
const listeners = new Set<() => void>();

function current(): Preferences {
  if (!prefs) {
    prefs = loadPrefs();
    setSoundEnabled(prefs.sound);
  }
  return prefs;
}

export function getPrefs(): Preferences {
  return typeof window === "undefined" ? DEFAULT_PREFS : current();
}

export function updatePrefs(patch: Partial<Preferences>) {
  prefs = { ...current(), ...patch };
  setSoundEnabled(prefs.sound);
  savePrefs(prefs);
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function usePrefs(): Preferences {
  return useSyncExternalStore(subscribe, getPrefs, () => DEFAULT_PREFS);
}

const noop = () => () => {};
/** True only after hydration on the client. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

/** Resolve the effective motion level, honouring the OS reduced-motion setting. */
export function effectiveMotion(pref: Preferences["motion"], osReduced: boolean | null): Preferences["motion"] {
  if (pref === "off") return "off";
  if (osReduced) return "reduced";
  return pref;
}
