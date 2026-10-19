export type Color = "w" | "b";
export type StartColorChoice = Color | "random";
export type FlipCount = 1 | 3 | 5 | 7;
export type Difficulty = "beginner" | "casual" | "intermediate" | "advanced";
export type Controller = "player" | "ai";
export type PromotionPiece = "q" | "r" | "b" | "n";

export const FLIP_COUNTS: FlipCount[] = [1, 3, 5, 7];
export const DIFFICULTIES: Difficulty[] = ["beginner", "casual", "intermediate", "advanced"];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: "Beginner",
  casual: "Casual",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export function opposite(c: Color): Color {
  return c === "w" ? "b" : "w";
}

export function colorName(c: Color): "White" | "Black" {
  return c === "w" ? "White" : "Black";
}

export interface GameSettings {
  startChoice: StartColorChoice;
  flips: FlipCount;
  difficulty: Difficulty;
}

export interface MoveRecord {
  /** Standard algebraic notation, e.g. "Nf3", "exd5", "O-O", "e8=Q#". */
  san: string;
  from: string;
  to: string;
  promotion?: PromotionPiece;
  /** Chess color that made the move. */
  color: Color;
  /** Who controlled that color when the move was made. */
  by: Controller;
  captured?: string;
  flags: string;
}

export interface FlipEvent {
  /** Number of plies completed when the flip happened. */
  ply: number;
  /** Color the player controls after this flip. */
  playerColor: Color;
}

export type EndReason =
  | "checkmate"
  | "stalemate"
  | "threefold"
  | "fifty-move"
  | "insufficient"
  | "resignation";

export type Outcome = "win" | "loss" | "draw";

export interface GameResult {
  outcome: Outcome;
  reason: EndReason;
  /** Winning chess color, or null for a draw. */
  winningColor: Color | null;
}

export type GameMode = "standard" | "daily";

export interface GameRecord {
  version: 1;
  sessionId: string;
  mode: GameMode;
  /** Daily challenge number (daily mode only). */
  dailyNumber?: number;
  dailyKey?: string;
  seed: number;
  settings: GameSettings;
  /** Starting position (FEN). Absent means the standard starting position. */
  startFen?: string;
  /** Resolved starting color for the player. */
  startColor: Color;
  /** Hidden plies after which control flips. */
  schedule: number[];
  moves: MoveRecord[];
  flips: FlipEvent[];
  /** Color the player currently controls. */
  playerColor: Color;
  result: GameResult | null;
  startedAt: number;
  endedAt?: number;
}
