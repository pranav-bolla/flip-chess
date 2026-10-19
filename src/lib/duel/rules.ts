import { Chess } from "chess.js";
import { detectResult, replay, toMoveRecord, tryMove } from "../chess/rules";
import type { Color, EndReason, MoveRecord, PromotionPiece } from "../types";

/**
 * Flip Duel: two people, one board, and a public countdown. After every
 * `flipEvery` completed full moves (White then Black), the players swap colors.
 *
 * This module is pure and shared by the server (authoritative) and the client
 * (display only). Chess turn order comes from the position; seat ownership of
 * colors is tracked separately and only changes at a flip.
 */

/** Seat 0 created the room; seat 1 joined. */
export type Seat = 0 | 1;

export interface DuelConfig {
  /** Full moves between flips. */
  flipEvery: number;
  /** Total flips allowed, or null for unlimited. */
  maxFlips: number | null;
}

export const DEFAULT_DUEL_CONFIG: DuelConfig = { flipEvery: 5, maxFlips: null };
export const FLIP_EVERY_LIMITS = { min: 1, max: 30 } as const;
export const MAX_FLIPS_LIMITS = { min: 1, max: 50 } as const;

export interface DuelMove extends Omit<MoveRecord, "by"> {
  /** Seat that made the move. */
  seat: Seat;
}

export interface DuelFlip {
  /** Plies completed when the flip happened (always after Black's move). */
  ply: number;
  /** Seat controlling White after the flip. */
  whiteSeat: Seat;
}

export interface DuelResult {
  reason: EndReason;
  winnerSeat: Seat | null;
  winningColor: Color | null;
}

export interface DuelGame {
  id: string;
  config: DuelConfig;
  /** Seat that started as White. */
  startWhiteSeat: Seat;
  /** Seat controlling White right now. */
  whiteSeat: Seat;
  moves: DuelMove[];
  flips: DuelFlip[];
  result: DuelResult | null;
  /** Server time (ms) until which moves are refused while the flip plays out. */
  flipLockUntil: number;
}

export function otherSeat(s: Seat): Seat {
  return s === 0 ? 1 : 0;
}

export function seatOfColor(game: Pick<DuelGame, "whiteSeat">, color: Color): Seat {
  return color === "w" ? game.whiteSeat : otherSeat(game.whiteSeat);
}

export function colorOfSeat(game: Pick<DuelGame, "whiteSeat">, seat: Seat): Color {
  return game.whiteSeat === seat ? "w" : "b";
}

/** Color a seat controlled after `plies` moves, reconstructed from flip events. */
export function colorOfSeatAtPly(game: Pick<DuelGame, "startWhiteSeat" | "flips">, seat: Seat, plies: number): Color {
  let white = game.startWhiteSeat;
  for (const f of game.flips) if (f.ply <= plies) white = f.whiteSeat;
  return white === seat ? "w" : "b";
}

export function validateConfig(input: unknown): DuelConfig | null {
  if (!input || typeof input !== "object") return null;
  const { flipEvery, maxFlips } = input as Record<string, unknown>;
  if (!Number.isInteger(flipEvery) || (flipEvery as number) < FLIP_EVERY_LIMITS.min || (flipEvery as number) > FLIP_EVERY_LIMITS.max) return null;
  if (maxFlips !== null && (!Number.isInteger(maxFlips) || (maxFlips as number) < MAX_FLIPS_LIMITS.min || (maxFlips as number) > MAX_FLIPS_LIMITS.max)) return null;
  return { flipEvery: flipEvery as number, maxFlips: maxFlips as number | null };
}

export function newDuelGame(id: string, config: DuelConfig, startWhiteSeat: Seat = 0): DuelGame {
  return { id, config, startWhiteSeat, whiteSeat: startWhiteSeat, moves: [], flips: [], result: null, flipLockUntil: 0 };
}

// ── Countdown ─────────────────────────────────────────────────────────

/** Completed full moves (a White move followed by a Black move). Duels start from the initial position. */
export function completedFullMoves(plies: number): number {
  return Math.floor(plies / 2);
}

export interface Countdown {
  /** Full moves still to complete before the next flip (≥1), or null when no flips remain. */
  movesLeft: number | null;
  /** Full moves completed since the last flip (for the progress bar). */
  progress: number;
  /** True when White has already moved in the final full move: the flip comes after Black's move. */
  flipAfterThisBlackMove: boolean;
  flipsLeft: number | null;
}

export function countdown(game: Pick<DuelGame, "config" | "flips" | "moves" | "result">): Countdown {
  const { flipEvery, maxFlips } = game.config;
  const flipsLeft = maxFlips === null ? null : Math.max(0, maxFlips - game.flips.length);
  const sinceLast = completedFullMoves(game.moves.length) - (game.flips.length ? completedFullMoves(game.flips[game.flips.length - 1].ply) : 0);
  if (flipsLeft === 0 || game.result) return { movesLeft: null, progress: sinceLast, flipAfterThisBlackMove: false, flipsLeft };
  const movesLeft = flipEvery - sinceLast;
  return { movesLeft, progress: sinceLast, flipAfterThisBlackMove: movesLeft === 1 && game.moves.length % 2 === 1, flipsLeft };
}

/** Whether a flip is due right now — only ever true just after Black's move completes. */
export function isDuelFlipDue(game: Pick<DuelGame, "config" | "flips" | "moves" | "result">): boolean {
  if (game.result || game.moves.length === 0 || game.moves.length % 2 !== 0) return false;
  const last = game.flips[game.flips.length - 1];
  if (last && last.ply === game.moves.length) return false; // never twice at the same boundary
  const c = countdown({ ...game, result: null });
  return c.movesLeft === 0;
}

// ── Actions (server-authoritative) ───────────────────────────────────

export type MoveRejection = "game-over" | "not-your-turn" | "illegal" | "flip-in-progress";

export interface MoveOutcome {
  game: DuelGame;
  flipped: boolean;
}

/**
 * Apply a seat's move. `chess` must be the game's current position and is
 * mutated on success. Order of operations: validate → move → detect game end
 * → flip (only if the game continues).
 */
export function applyDuelMove(
  game: DuelGame,
  chess: Chess,
  seat: Seat,
  from: string,
  to: string,
  promotion: PromotionPiece | undefined,
  now: number,
  flipLockMs: number,
): MoveOutcome | MoveRejection {
  if (game.result) return "game-over";
  if (now < game.flipLockUntil) return "flip-in-progress";
  if (seatOfColor(game, chess.turn() as Color) !== seat) return "not-your-turn";
  const move = tryMove(chess, from, to, promotion);
  if (!move) return "illegal";

  const { by: _by, ...rec } = toMoveRecord(move, "player");
  void _by;
  let next: DuelGame = { ...game, moves: [...game.moves, { ...rec, seat }] };

  // Seat→color mapping is irrelevant to the winner: whoever controlled the mating color wins.
  const r = detectResult(chess, "w");
  if (r) {
    next = { ...next, result: { reason: r.reason, winningColor: r.winningColor, winnerSeat: r.winningColor ? seatOfColor(next, r.winningColor) : null } };
    return { game: next, flipped: false };
  }

  if (isDuelFlipDue(next)) {
    const whiteSeat = otherSeat(next.whiteSeat);
    next = { ...next, whiteSeat, flips: [...next.flips, { ply: next.moves.length, whiteSeat }], flipLockUntil: now + flipLockMs };
    return { game: next, flipped: true };
  }
  return { game: next, flipped: false };
}

export function resignDuel(game: DuelGame, seat: Seat): DuelGame | null {
  if (game.result) return null;
  const winnerSeat = otherSeat(seat);
  return { ...game, result: { reason: "resignation", winnerSeat, winningColor: colorOfSeat(game, winnerSeat) } };
}

export function duelPosition(game: Pick<DuelGame, "moves">, upTo?: number): Chess {
  return replay(game.moves, upTo);
}
