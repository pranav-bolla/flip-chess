import { createRng, mixSeed } from "../rng";
import type { Difficulty } from "../types";
import type { EngineLine } from "./types";

/**
 * Difficulty is expressed as a fixed search depth plus a seeded choice among
 * Stockfish's top candidate lines. Stockfish's built-in "Skill Level" uses a
 * time-seeded RNG, so we do the weakening ourselves: same position + same
 * seed + same settings → same move. That keeps Daily Flip comparable.
 */
export interface DifficultyProfile {
  depth: number;
  multiPv: number;
  /** Candidates within this many centipawns of the best line are eligible. */
  tolerance: number;
  /** Softmax temperature (cp). Higher = more willing to pick weaker eligible moves. */
  temperature: number;
  /** Minimum delay before the AI moves, so it never feels instant. */
  minThinkMs: number;
}

export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  beginner: { depth: 3, multiPv: 6, tolerance: 350, temperature: 140, minThinkMs: 550 },
  casual: { depth: 6, multiPv: 4, tolerance: 140, temperature: 60, minThinkMs: 500 },
  intermediate: { depth: 10, multiPv: 3, tolerance: 45, temperature: 22, minThinkMs: 450 },
  advanced: { depth: 15, multiPv: 1, tolerance: 0, temperature: 1, minThinkMs: 350 },
};

export const MATE_SCORE = 100_000;

/** Parse a UCI "info" line into a candidate (multipv index, line), or null. */
export function parseInfoLine(line: string): { index: number; depth: number; line: EngineLine } | null {
  if (!line.startsWith("info") || !line.includes(" pv ")) return null;
  const depth = Number(/ depth (\d+)/.exec(line)?.[1] ?? 0);
  const index = Number(/ multipv (\d+)/.exec(line)?.[1] ?? 1);
  const cp = / score cp (-?\d+)/.exec(line);
  const mate = / score mate (-?\d+)/.exec(line);
  const move = / pv (\S+)/.exec(line)?.[1];
  if (!move) return null;
  let score = 0;
  if (cp) score = Number(cp[1]);
  else if (mate) {
    const n = Number(mate[1]);
    score = n > 0 ? MATE_SCORE - n : -MATE_SCORE - n;
  } else return null;
  return { index, depth, line: { move, score } };
}

/** Pick a move from ranked candidate lines, deterministically for a given seed. */
export function chooseMove(lines: readonly EngineLine[], difficulty: Difficulty, seed: number, fen: string): string {
  if (lines.length === 0) throw new Error("No candidate moves");
  const profile = DIFFICULTY_PROFILES[difficulty];
  const sorted = [...lines].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  // Never miss a forced mate the engine found, and never throw away a won game for free.
  if (best.score >= MATE_SCORE - 50 || profile.tolerance === 0) return best.move;
  const eligible = sorted.filter((l) => best.score - l.score <= profile.tolerance);
  const weights = eligible.map((l) => Math.exp((l.score - best.score) / profile.temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  const rng = createRng(mixSeed("ai-choice", seed, fen, difficulty));
  let r = rng() * total;
  for (let i = 0; i < eligible.length; i++) {
    r -= weights[i];
    if (r <= 0) return eligible[i].move;
  }
  return eligible[eligible.length - 1].move;
}
