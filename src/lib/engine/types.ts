import type { Difficulty } from "../types";

export interface EngineLine {
  /** UCI move, e.g. "e2e4" or "e7e8q". */
  move: string;
  /** Score in centipawns from the side to move's perspective (mates mapped to ±large). */
  score: number;
}

export interface SearchRequest {
  fen: string;
  difficulty: Difficulty;
  /** Seed for deterministic move selection among candidates. */
  seed: number;
}

/**
 * Anything that can choose a move. The game controller depends only on this,
 * so tests can substitute a fake and the UI never talks to the worker directly.
 */
export interface MoveEngine {
  /** Resolve with a UCI move, or null when the search was cancelled. */
  bestMove(request: SearchRequest): Promise<string | null>;
  /** Cancel any in-flight search. Its promise resolves with null. */
  cancel(): void;
}
