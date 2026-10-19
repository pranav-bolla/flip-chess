import type { GameRecord, GameSettings } from "../types";
import { DEFAULT_DUEL_CONFIG, type DuelConfig } from "../duel/rules";
import type { GameSummary } from "../game/summary";

/**
 * localStorage persistence. Every access is guarded: private browsing,
 * disabled storage, or corrupted JSON all fall back to defaults.
 */

const KEYS = {
  prefs: "flip-chess:prefs:v1",
  game: "flip-chess:game:v1",
  history: "flip-chess:history:v1",
  daily: "flip-chess:daily:v1",
} as const;

export type MotionPref = "full" | "reduced" | "off";

export interface Preferences {
  setup: GameSettings;
  duel: DuelConfig;
  sound: boolean;
  motion: MotionPref;
  showCoordinates: boolean;
  showLegalMoves: boolean;
}

export const DEFAULT_PREFS: Preferences = {
  setup: { startChoice: "w", flips: 3, difficulty: "casual" },
  duel: DEFAULT_DUEL_CONFIG,
  sound: true,
  motion: "full",
  showCoordinates: true,
  showLegalMoves: true,
};

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — the game still works, it just won't persist.
  }
}

export function loadPrefs(): Preferences {
  const p = read<Partial<Preferences>>(KEYS.prefs);
  return { ...DEFAULT_PREFS, ...p, setup: { ...DEFAULT_PREFS.setup, ...p?.setup }, duel: { ...DEFAULT_PREFS.duel, ...p?.duel } };
}
export const savePrefs = (p: Preferences) => write(KEYS.prefs, p);

export function loadActiveGame(): GameRecord | null {
  const g = read<GameRecord>(KEYS.game);
  if (!g || g.version !== 1 || !Array.isArray(g.moves) || !Array.isArray(g.schedule)) return null;
  return g;
}
export const saveActiveGame = (g: GameRecord | null) => write(KEYS.game, g);

export function loadHistory(): GameSummary[] {
  return read<GameSummary[]>(KEYS.history) ?? [];
}
export function addToHistory(s: GameSummary) {
  const h = loadHistory().filter((x) => x.sessionId !== s.sessionId);
  write(KEYS.history, [s, ...h].slice(0, 100));
}

/** Daily attempts keyed by date. "started" marks the one official attempt as used. */
export interface DailyEntry {
  key: string;
  number: number;
  sessionId: string;
  status: "started" | "done";
  summary?: GameSummary;
}

export function loadDaily(): Record<string, DailyEntry> {
  return read<Record<string, DailyEntry>>(KEYS.daily) ?? {};
}
export function saveDailyEntry(entry: DailyEntry) {
  write(KEYS.daily, { ...loadDaily(), [entry.key]: entry });
}
