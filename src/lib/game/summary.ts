import type { Color, EndReason, GameRecord, Outcome } from "../types";

export interface GameSummary {
  sessionId: string;
  mode: GameRecord["mode"];
  dailyNumber?: number;
  dailyKey?: string;
  outcome: Outcome;
  reason: EndReason;
  winningColor: Color | null;
  startColor: Color;
  finalColor: Color;
  flipsPlanned: number;
  flipsCompleted: number;
  /** Full moves, counted the way chess counts them. */
  moves: number;
  plies: number;
  difficulty: GameRecord["settings"]["difficulty"];
  endedAt: number;
}

export function fullMoves(plies: number): number {
  return Math.ceil(plies / 2);
}

export function summarize(record: GameRecord): GameSummary | null {
  if (!record.result) return null;
  return {
    sessionId: record.sessionId,
    mode: record.mode,
    dailyNumber: record.dailyNumber,
    dailyKey: record.dailyKey,
    outcome: record.result.outcome,
    reason: record.result.reason,
    winningColor: record.result.winningColor,
    startColor: record.startColor,
    finalColor: record.playerColor,
    flipsPlanned: record.schedule.length,
    flipsCompleted: record.flips.length,
    moves: fullMoves(record.moves.length),
    plies: record.moves.length,
    difficulty: record.settings.difficulty,
    endedAt: record.endedAt ?? Date.now(),
  };
}
