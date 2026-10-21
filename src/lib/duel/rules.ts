import { Chess } from "chess.js";
import { detectResult, replay, toMoveRecord, tryMove } from "../chess/rules";
import type { Color, EndReason, MoveRecord, PromotionPiece } from "../types";

/**
 * Flip Duel: two people, one board, and exactly one flip. The server picks a
 * random full move in FLIP_WINDOW when the game starts and keeps it secret;
 * right after Black completes that move, the players swap colors for good.
 * Nobody knows when it's coming, so throwing your own position away is a
 * gamble rather than a plan.
 *
 * This module is pure and shared by the server (authoritative) and the client
 * (display only). Chess turn order comes from the position; seat ownership of
 * colors is tracked separately and only changes at a flip.
 */

/** Seat 0 created the room; seat 1 joined. */
export type Seat = 0 | 1;

/** Full moves (inclusive) the secret flip is drawn from. */
export const FLIP_WINDOW = { earliest: 6, latest: 20 } as const;

/** Draw the secret flip point: the ply right after Black completes a random full move in the window. */
export function randomFlipPly(random: () => number = Math.random): number {
  const span = FLIP_WINDOW.latest - FLIP_WINDOW.earliest + 1;
  return 2 * (FLIP_WINDOW.earliest + Math.floor(random() * span));
}

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
  /** Seat that started as White. */
  startWhiteSeat: Seat;
  /** Seat controlling White right now. */
  whiteSeat: Seat;
  moves: DuelMove[];
  /** At most one flip; empty until it happens. The planned ply is never part of the game state. */
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

export function newDuelGame(id: string, startWhiteSeat: Seat = 0): DuelGame {
  return { id, startWhiteSeat, whiteSeat: startWhiteSeat, moves: [], flips: [], result: null, flipLockUntil: 0 };
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
 * → flip (only at `flipAtPly`, only once, and only if the game continues).
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
  flipAtPly: number,
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

  if (next.flips.length === 0 && next.moves.length === flipAtPly) {
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
