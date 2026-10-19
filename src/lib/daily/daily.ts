import { createRng, mixSeed } from "../rng";
import { dailyPositions, type DailyPosition } from "./positions";
import type { Difficulty, FlipCount, GameSettings } from "../types";

/**
 * Daily Flip: everyone gets the same challenge for a calendar day (local
 * time). The date key seeds the starting color, difficulty, flip count, the
 * hidden flip schedule, and the AI's move selection — so the challenge is
 * identical for everyone, even though different player moves will of course
 * lead to different positions.
 */

/** Daily #1 is this date. */
const EPOCH = Date.UTC(2026, 8, 1); // 2026-09-01

export function dateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dailyNumberFor(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - EPOCH) / 86_400_000) + 1;
}

export interface DailyChallenge {
  key: string;
  number: number;
  seed: number;
  settings: GameSettings & { startChoice: "w" | "b" };
  /** Everyone starts today's game from this position. */
  position: DailyPosition;
}

/**
 * Walk the positions in a fixed shuffled order so consecutive days never
 * repeat until every position has been used.
 */
function positionFor(number: number): DailyPosition {
  const list = dailyPositions();
  const order = list.map((_, i) => i);
  const rng = createRng(mixSeed("daily-position-order"));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const idx = order[(((number - 1) % list.length) + list.length) % list.length];
  return list[idx];
}

const DAILY_DIFFICULTIES: Difficulty[] = ["casual", "casual", "intermediate", "intermediate", "beginner", "advanced", "casual"];
const DAILY_FLIPS: FlipCount[] = [3, 3, 5, 3, 5, 7, 1];

export function dailyChallenge(date = new Date()): DailyChallenge {
  const key = dateKey(date);
  const seed = mixSeed("flip-chess-daily", key);
  const rng = createRng(seed);
  const startChoice = rng() < 0.5 ? "w" : "b";
  const difficulty = DAILY_DIFFICULTIES[Math.floor(rng() * DAILY_DIFFICULTIES.length)];
  const flips = DAILY_FLIPS[Math.floor(rng() * DAILY_FLIPS.length)];
  const number = dailyNumberFor(key);
  return { key, number, seed, settings: { startChoice, difficulty, flips }, position: positionFor(number) };
}

/** Milliseconds until local midnight. */
export function msUntilNextDaily(now = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}
