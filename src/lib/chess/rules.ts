import { Chess, type Move } from "chess.js";
import type { Color, EndReason, GameResult, MoveRecord, Outcome, PromotionPiece } from "../types";

/**
 * Thin wrapper around chess.js. All legality, check, and draw detection lives
 * in chess.js — nothing here implements movement rules by hand.
 */

/** Rebuild the authoritative position by replaying moves (preserves repetition history). */
export function replay(
  moves: readonly Pick<MoveRecord, "from" | "to" | "promotion">[],
  upTo = moves.length,
  startFen?: string,
): Chess {
  const chess = startFen ? new Chess(startFen) : new Chess();
  for (let i = 0; i < upTo; i++) {
    const m = moves[i];
    chess.move({ from: m.from, to: m.to, promotion: m.promotion });
  }
  return chess;
}

/** Attempt a move; returns null if illegal instead of throwing. */
export function tryMove(chess: Chess, from: string, to: string, promotion?: PromotionPiece): Move | null {
  try {
    return chess.move({ from, to, promotion });
  } catch {
    return null;
  }
}

export function isLegal(chess: Chess, from: string, to: string, promotion?: PromotionPiece): boolean {
  return chess
    .moves({ square: from as never, verbose: true })
    .some((m) => m.to === to && (m.promotion ? m.promotion === (promotion ?? "q") : !promotion));
}

export function needsPromotion(chess: Chess, from: string, to: string): boolean {
  return chess.moves({ square: from as never, verbose: true }).some((m) => m.to === to && !!m.promotion);
}

export function legalTargets(chess: Chess, from: string): string[] {
  return Array.from(new Set(chess.moves({ square: from as never, verbose: true }).map((m) => m.to)));
}

/** Detect a finished game. Outcome is from the perspective of the player's *current* color. */
export function detectResult(chess: Chess, playerColor: Color): GameResult | null {
  if (chess.isCheckmate()) {
    const loser = chess.turn() as Color;
    const winner: Color = loser === "w" ? "b" : "w";
    return { outcome: winner === playerColor ? "win" : "loss", reason: "checkmate", winningColor: winner };
  }
  let reason: EndReason | null = null;
  if (chess.isStalemate()) reason = "stalemate";
  else if (chess.isInsufficientMaterial()) reason = "insufficient";
  else if (chess.isThreefoldRepetition()) reason = "threefold";
  else if (chess.isDrawByFiftyMoves()) reason = "fifty-move";
  if (reason) return { outcome: "draw", reason, winningColor: null };
  return null;
}

export function resignationResult(playerColor: Color): GameResult {
  return { outcome: "loss" as Outcome, reason: "resignation", winningColor: playerColor === "w" ? "b" : "w" };
}

export function toMoveRecord(move: Move, by: MoveRecord["by"]): MoveRecord {
  return {
    san: move.san,
    from: move.from,
    to: move.to,
    promotion: move.promotion as PromotionPiece | undefined,
    color: move.color as Color,
    by,
    captured: move.captured,
    flags: move.flags,
  };
}

export const END_REASON_LABEL: Record<EndReason, string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  threefold: "Threefold repetition",
  "fifty-move": "50-move rule",
  insufficient: "Insufficient material",
  resignation: "Resignation",
};

/**
 * Stable identities for pieces so the board can animate them between squares.
 * Ids are the piece's starting square; replaying the move list tracks them.
 */
export function pieceIdentities(moves: readonly MoveRecord[], upTo = moves.length, startFen?: string): Map<string, string> {
  const ids = new Map<string, string>();
  const start = startFen ? new Chess(startFen) : new Chess();
  for (const row of start.board()) for (const p of row) if (p) ids.set(p.square, p.square);
  for (let i = 0; i < upTo; i++) {
    const m = moves[i];
    const id = ids.get(m.from);
    ids.delete(m.from);
    if (m.flags.includes("e")) {
      // En passant: the captured pawn sits beside the destination square.
      ids.delete(`${m.to[0]}${m.from[1]}`);
    }
    if (id) ids.set(m.to, id);
    if (m.flags.includes("k") || m.flags.includes("q")) {
      const rank = m.from[1];
      const [rf, rt] = m.flags.includes("k") ? ["h", "f"] : ["a", "d"];
      const rookId = ids.get(`${rf}${rank}`);
      ids.delete(`${rf}${rank}`);
      if (rookId) ids.set(`${rt}${rank}`, rookId);
    }
  }
  return ids;
}

/**
 * Chess move number and color of the ply at index `ply`, counted from the
 * starting position. Works for games that begin from a custom FEN.
 */
export function moveNumberAt(ply: number, startFen?: string): { number: number; color: Color } {
  const parts = (startFen ?? "").split(" ");
  const blackFirst = parts[1] === "b";
  const firstNumber = Number(parts[5]) || 1;
  const n = ply + (blackFirst ? 1 : 0);
  return { number: firstNumber + Math.floor(n / 2), color: n % 2 === 0 ? "w" : "b" };
}
