import type { Chess } from "chess.js";
import { createRng, mixSeed } from "../rng";
import { detectResult, replay, resignationResult, toMoveRecord, tryMove } from "../chess/rules";
import { DIFFICULTY_PROFILES } from "../engine/difficulty";
import type { MoveEngine } from "../engine/types";
import { controllerOf, flipOwnership } from "../flip/ownership";
import { isFlipDue } from "../flip/schedule";
import type { Color, Controller, GameRecord, GameResult, PromotionPiece } from "../types";

/**
 * The game controller is the single authority over a running game.
 *
 * It owns one chess.js position, the ownership record, and a small phase
 * machine that decides who acts next:
 *
 *   player ──move──▶ settling ──▶ (flipping ──▶) player | ai | over
 *   ai     ──move──▶ settling ──▶ (flipping ──▶) player | ai | over
 *
 * Flips are only evaluated at the end of `settling`, i.e. between completed
 * legal moves and after the move animation — never mid-move, never during
 * promotion selection (which happens before a move is submitted).
 *
 * Every asynchronous continuation (timers, engine replies) captures the
 * current `epoch`. Any transition that invalidates pending work bumps the
 * epoch, so stale engine replies or timers from an earlier turn, an earlier
 * game, or before a flip are silently dropped.
 */

export type Phase = "idle" | "player" | "ai" | "settling" | "flipping" | "over";

export interface FlipAnimation {
  /** Increments per flip so the UI can key animations. */
  id: number;
  toColor: Color;
  final: boolean;
}

export interface GameSnapshot {
  record: GameRecord | null;
  phase: Phase;
  fen: string;
  turn: Color;
  inCheck: boolean;
  lastMove: { from: string; to: string } | null;
  flip: FlipAnimation | null;
  engineError: boolean;
}

export type GameEvent =
  | { type: "move"; by: Controller; capture: boolean; check: boolean; castle: boolean; promotion: boolean }
  | { type: "flip"; toColor: Color; final: boolean }
  | { type: "gameover"; result: GameResult };

export interface Timing {
  /** Pause after each move so the piece animation completes before anything else happens. */
  moveSettleMs: number;
  /** Duration board interaction is paused for the flip effect. */
  flipMs: number;
  /** Respect each difficulty's minimum "thinking" delay. */
  aiMinThink: boolean;
}

export interface ControllerOptions {
  engine: MoveEngine;
  timing?: Partial<Timing>;
  persist?: (record: GameRecord | null) => void;
  onEvent?: (event: GameEvent) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}

const DEFAULT_TIMING: Timing = { moveSettleMs: 260, flipMs: 1100, aiMinThink: true };

export class GameController {
  private engine: MoveEngine;
  private timing: Timing;
  private persist: (record: GameRecord | null) => void;
  private onEvent: (event: GameEvent) => void;
  private setTimer: (fn: () => void, ms: number) => unknown;
  private clearTimer: (handle: unknown) => void;
  private now: () => number;

  private record: GameRecord | null = null;
  private chess: Chess = replay([]);
  private phase: Phase = "idle";
  private epoch = 0;
  private flipAnim: FlipAnimation | null = null;
  private engineError = false;
  private timers = new Set<unknown>();
  private listeners = new Set<() => void>();
  private snapshot: GameSnapshot;

  /** Exposed for tests: number of engine requests issued. */
  engineRequests = 0;

  constructor(options: ControllerOptions) {
    this.engine = options.engine;
    this.timing = { ...DEFAULT_TIMING, ...options.timing };
    this.persist = options.persist ?? (() => {});
    this.onEvent = options.onEvent ?? (() => {});
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.now = options.now ?? (() => Date.now());
    this.snapshot = this.buildSnapshot();
  }

  // ── Subscription (useSyncExternalStore-compatible) ─────────────────────

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): GameSnapshot => this.snapshot;

  private emit() {
    this.snapshot = this.buildSnapshot();
    for (const l of this.listeners) l();
  }

  private buildSnapshot(): GameSnapshot {
    const history = this.record?.moves ?? [];
    const last = history[history.length - 1];
    return {
      record: this.record,
      phase: this.phase,
      fen: this.chess.fen(),
      turn: this.chess.turn() as Color,
      inCheck: this.chess.inCheck(),
      lastMove: last ? { from: last.from, to: last.to } : null,
      flip: this.flipAnim,
      engineError: this.engineError,
    };
  }

  setTiming(timing: Partial<Timing>) {
    this.timing = { ...this.timing, ...timing };
  }

  /** Current chess position (read-only use). */
  get position(): Chess {
    return this.chess;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /** Start a new game or resume a restored one. Invalidates everything pending. */
  load(record: GameRecord | null) {
    this.invalidate();
    this.engine.cancel();
    this.flipAnim = null;
    this.engineError = false;
    this.record = record;
    this.chess = replay(record?.moves ?? [], undefined, record?.startFen);
    if (record && !record.result) {
      // A restored game may have ended on its last move before being saved.
      const result = detectResult(this.chess, record.playerColor);
      if (result) this.record = { ...record, result, endedAt: this.now() };
    }
    this.persist(this.record);
    this.advance();
  }

  /** Forget the current game entirely. */
  clear() {
    this.load(null);
  }

  resign() {
    const record = this.record;
    if (!record || record.result) return;
    this.invalidate();
    this.engine.cancel();
    this.flipAnim = null;
    this.finish(resignationResult(record.playerColor));
  }

  // ── Moves ──────────────────────────────────────────────────────────────

  /** Whose controller is to move in the current position. */
  get toMove(): Controller | null {
    if (!this.record) return null;
    return controllerOf(this.chess.turn() as Color, this.record.playerColor);
  }

  canPlayerMove(): boolean {
    return this.phase === "player" && this.toMove === "player";
  }

  /** Submit a player move. Returns false (and changes nothing) if not allowed or illegal. */
  playerMove(from: string, to: string, promotion?: PromotionPiece): boolean {
    if (!this.canPlayerMove()) return false;
    return this.commitMove(from, to, promotion, "player");
  }

  private commitMove(from: string, to: string, promotion: PromotionPiece | undefined, by: Controller): boolean {
    const record = this.record;
    if (!record || record.result) return false;
    if (controllerOf(this.chess.turn() as Color, record.playerColor) !== by) return false;
    const move = tryMove(this.chess, from, to, promotion);
    if (!move) return false;

    this.invalidate();
    const moves = [...record.moves, toMoveRecord(move, by)];
    this.record = { ...record, moves };
    this.flipAnim = null;
    this.onEvent({
      type: "move",
      by,
      capture: !!move.captured,
      check: this.chess.inCheck(),
      castle: move.flags.includes("k") || move.flags.includes("q"),
      promotion: !!move.promotion,
    });

    const result = detectResult(this.chess, record.playerColor);
    if (result) {
      this.finish(result);
      return true;
    }
    this.persist(this.record);
    this.phase = "settling";
    this.emit();
    this.after(this.timing.moveSettleMs, () => this.advance());
    return true;
  }

  // ── Turn dispatch ──────────────────────────────────────────────────────

  /** Decide what happens next at a safe boundary between moves. */
  private advance() {
    const record = this.record;
    if (!record) {
      this.phase = "idle";
      this.emit();
      return;
    }
    if (record.result) {
      this.phase = "over";
      this.emit();
      return;
    }
    const plies = record.moves.length;
    const lastFlipPly = record.flips.length ? record.flips[record.flips.length - 1].ply : -1;
    if (isFlipDue(plies, record.schedule, record.flips.length, lastFlipPly)) {
      this.beginFlip(plies);
      return;
    }
    this.dispatchTurn();
  }

  private beginFlip(plies: number) {
    const record = this.record!;
    this.invalidate();
    this.engine.cancel();
    const event = flipOwnership(record.playerColor, plies);
    const flips = [...record.flips, event];
    // Ownership changes; the chess position (FEN, castling, en passant,
    // clocks, repetition history) is untouched.
    this.record = { ...record, flips, playerColor: event.playerColor };
    const final = flips.length >= record.schedule.length;
    this.flipAnim = { id: flips.length, toColor: event.playerColor, final };
    this.phase = "flipping";
    this.persist(this.record);
    this.onEvent({ type: "flip", toColor: event.playerColor, final });
    this.emit();
    this.after(this.timing.flipMs, () => {
      this.flipAnim = null;
      this.dispatchTurn();
    });
  }

  private dispatchTurn() {
    const record = this.record!;
    const turn = this.chess.turn() as Color;
    if (controllerOf(turn, record.playerColor) === "player") {
      this.phase = "player";
      this.emit();
      return;
    }
    this.phase = "ai";
    this.emit();
    this.requestAiMove();
  }

  private requestAiMove() {
    const record = this.record!;
    const ticket = this.epoch;
    const fen = this.chess.fen();
    const startedAt = this.now();
    const minThink = this.timing.aiMinThink ? DIFFICULTY_PROFILES[record.settings.difficulty].minThinkMs : 0;
    this.engineRequests++;

    const deliver = (uci: string | null) => {
      if (!this.isCurrent(ticket, record.sessionId) || this.phase !== "ai") return;
      let move = uci ? parseUci(uci) : null;
      if (!move || !this.chess.moves({ verbose: true }).some((m) => m.from === move!.from && m.to === move!.to)) {
        // Engine unavailable or returned something unusable: fall back to a
        // deterministic legal move so the game never stalls.
        this.engineError = true;
        move = fallbackMove(this.chess, record.seed);
      }
      const wait = Math.max(0, minThink - (this.now() - startedAt));
      this.after(wait, () => {
        if (this.phase !== "ai") return;
        this.commitMove(move!.from, move!.to, move!.promotion, "ai");
      });
    };

    this.engine
      .bestMove({ fen, difficulty: record.settings.difficulty, seed: record.seed })
      .then((uci) => {
        // A null reply for a still-current request means the engine failed.
        deliver(uci);
      })
      .catch(() => deliver(null));
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private finish(result: GameResult) {
    this.record = { ...this.record!, result, endedAt: this.now() };
    this.phase = "over";
    this.persist(this.record);
    this.onEvent({ type: "gameover", result });
    this.emit();
  }

  /** Drop every pending timer and engine reply. */
  private invalidate() {
    this.epoch++;
    for (const t of this.timers) this.clearTimer(t);
    this.timers.clear();
  }

  private isCurrent(ticket: number, sessionId: string) {
    return ticket === this.epoch && this.record?.sessionId === sessionId;
  }

  private after(ms: number, fn: () => void) {
    const ticket = this.epoch;
    const session = this.record?.sessionId ?? "";
    const handle = this.setTimer(() => {
      this.timers.delete(handle);
      if (!this.isCurrent(ticket, session)) return;
      fn();
    }, ms);
    this.timers.add(handle);
  }
}

export function parseUci(uci: string): { from: string; to: string; promotion?: PromotionPiece } | null {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  if (!m) return null;
  return { from: m[1], to: m[2], promotion: m[3] as PromotionPiece | undefined };
}

function fallbackMove(chess: Chess, seed: number) {
  const moves = chess.moves({ verbose: true });
  const rng = createRng(mixSeed("fallback", seed, chess.fen()));
  // Prefer captures and checks a little, otherwise a seeded pick.
  const ranked = [...moves].sort((a, b) => score(b) - score(a));
  const top = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 3)));
  const m = top[Math.floor(rng() * top.length)];
  return { from: m.from, to: m.to, promotion: m.promotion as PromotionPiece | undefined };
  function score(m: (typeof moves)[number]) {
    return (m.captured ? 2 : 0) + (m.san.includes("+") ? 1 : 0) + (m.promotion ? 3 : 0);
  }
}
