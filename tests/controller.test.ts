import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { GameController, type GameEvent } from "@/lib/game/controller";
import { createGame } from "@/lib/game/create";
import { replay } from "@/lib/chess/rules";
import { controllerOf, playerColorAtPly } from "@/lib/flip/ownership";
import { toPgn } from "@/lib/game/pgn";
import type { Color, GameRecord } from "@/lib/types";
import { FakeEngine, flush, randomLegal } from "./helpers";

const SETTLE = 10;
const FLIP = 100;

function setup(opts: { start?: Color; schedule?: number[]; seed?: number } = {}) {
  const engine = new FakeEngine();
  const events: GameEvent[] = [];
  let saved: GameRecord | null = null;
  const ctl = new GameController({
    engine,
    timing: { moveSettleMs: SETTLE, flipMs: FLIP, aiMinThink: false },
    onEvent: (e) => events.push(e),
    persist: (r) => (saved = r),
  });
  const record = createGame({
    settings: { startChoice: opts.start ?? "w", flips: 3, difficulty: "casual" },
    seed: opts.seed ?? 42,
  });
  if (opts.schedule) record.schedule = opts.schedule;
  return { engine, ctl, record, events, saved: () => saved };
}

/** Advance timers and microtasks until the controller settles in a stable phase. */
async function settle() {
  for (let i = 0; i < 20; i++) {
    await flush();
    vi.advanceTimersByTime(FLIP + SETTLE);
  }
  await flush();
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("turn dispatch", () => {
  it("lets the player move first as White and asks the AI to reply as Black", async () => {
    const { ctl, engine, record } = setup({ schedule: [99] });
    ctl.load(record);
    expect(ctl.getSnapshot().phase).toBe("player");
    expect(engine.requests).toHaveLength(0);
    expect(ctl.playerMove("e2", "e4")).toBe(true);
    await settle();
    expect(ctl.getSnapshot().phase).toBe("ai");
    expect(engine.requests).toHaveLength(1);
    expect(engine.requests[0].fen.split(" ")[1]).toBe("b");
  });

  it("has the AI open the game when the player starts as Black", async () => {
    const { ctl, engine, record } = setup({ start: "b", schedule: [99] });
    ctl.load(record);
    expect(ctl.getSnapshot().phase).toBe("ai");
    expect(engine.requests).toHaveLength(1);
    engine.reply("e2e4");
    await settle();
    expect(ctl.getSnapshot().record!.moves[0]).toMatchObject({ san: "e4", by: "ai", color: "w" });
    expect(ctl.getSnapshot().phase).toBe("player");
  });

  it("rejects illegal moves, out-of-turn moves, and moves during settling", async () => {
    const { ctl, record } = setup({ schedule: [99] });
    ctl.load(record);
    expect(ctl.playerMove("e2", "e5")).toBe(false);
    expect(ctl.playerMove("e7", "e5")).toBe(false); // AI's color
    expect(ctl.playerMove("e2", "e4")).toBe(true);
    expect(ctl.getSnapshot().phase).toBe("settling");
    expect(ctl.playerMove("d2", "d4")).toBe(false); // double move
    expect(ctl.getSnapshot().record!.moves).toHaveLength(1);
  });
});

describe("flips", () => {
  it("switches control without touching the position, then the AI plays the color it inherited", async () => {
    // Player is White. After ply 3 (White's 2nd move) it's Black to move and control flips:
    // the player becomes Black and the AI becomes White — but it's Black's turn, so the player moves.
    const { ctl, engine, record, events } = setup({ schedule: [3, 10] });
    ctl.load(record);
    ctl.playerMove("e2", "e4");
    await settle();
    engine.reply("e7e5");
    await settle();
    const fenBefore = ctl.getSnapshot().fen;
    ctl.playerMove("g1", "f3");
    await flush();
    vi.advanceTimersByTime(SETTLE);
    await flush();
    const snap = ctl.getSnapshot();
    expect(snap.phase).toBe("flipping");
    expect(snap.record!.playerColor).toBe("b");
    expect(snap.flip).toMatchObject({ toColor: "b", final: false });
    expect(events.some((e) => e.type === "flip")).toBe(true);
    // Input is blocked during the flip.
    expect(ctl.playerMove("b8", "c6")).toBe(false);
    expect(engine.requests).toHaveLength(1);
    vi.advanceTimersByTime(FLIP);
    await flush();
    expect(ctl.getSnapshot().phase).toBe("player");
    expect(ctl.getSnapshot().turn).toBe("b");
    expect(fenBefore).not.toBe(ctl.getSnapshot().fen); // Nf3 was played
    expect(ctl.playerMove("b8", "c6")).toBe(true);
    await settle();
    // The AI is now White and is asked to move for White.
    expect(engine.requests).toHaveLength(2);
    expect(engine.requests[1].fen.split(" ")[1]).toBe("w");
  });

  it("makes the AI move immediately when a flip hands it the side to move", async () => {
    // Flip after ply 2 (Black's move): White to move, player becomes Black → AI must play White now.
    const { ctl, engine, record } = setup({ schedule: [2, 12] });
    ctl.load(record);
    ctl.playerMove("e2", "e4");
    await settle();
    engine.reply("e7e5");
    await flush();
    vi.advanceTimersByTime(SETTLE);
    await flush();
    expect(ctl.getSnapshot().phase).toBe("flipping");
    expect(engine.requests).toHaveLength(1);
    vi.advanceTimersByTime(FLIP);
    await flush();
    expect(ctl.getSnapshot().phase).toBe("ai");
    expect(engine.requests).toHaveLength(2);
    expect(engine.requests[1].fen.split(" ")[1]).toBe("w");
    engine.reply("g1f3");
    await settle();
    const moves = ctl.getSnapshot().record!.moves;
    // The AI moved Black's e5 and then White's Nf3: consecutive plies by the same controller.
    expect(moves.map((m) => [m.san, m.by])).toEqual([
      ["e4", "player"],
      ["e5", "ai"],
      ["Nf3", "ai"],
    ]);
    expect(ctl.getSnapshot().phase).toBe("player");
    expect(ctl.getSnapshot().turn).toBe("b");
  });

  it("preserves castling rights, en passant and clocks exactly across flips", async () => {
    const { ctl, engine, record } = setup({ schedule: [5, 11] });
    ctl.load(record);
    // 1. e4 a6 2. e5 d5 → en passant available on d6 for White at ply 4.
    ctl.playerMove("e2", "e4");
    await settle();
    engine.reply("a7a6");
    await settle();
    ctl.playerMove("e4", "e5");
    await settle();
    engine.reply("d7d5");
    await settle();
    // 3. exd6 e.p. (ply 5) → flip fires at ply 5.
    expect(ctl.playerMove("e5", "d6")).toBe(true);
    const fenAfterMove = ctl.getSnapshot().fen;
    await flush();
    vi.advanceTimersByTime(SETTLE);
    await flush();
    expect(ctl.getSnapshot().phase).toBe("flipping");
    expect(ctl.getSnapshot().fen).toBe(fenAfterMove);
    expect(fenAfterMove).toContain("KQkq");
    vi.advanceTimersByTime(FLIP);
    await flush();
    expect(ctl.getSnapshot().fen).toBe(fenAfterMove);
    expect(ctl.getSnapshot().record!.moves[4].flags).toContain("e");
  });

  it("handles a flip while the side to move is in check", async () => {
    // 1. e4 e5 2. Nf3 d6 3. Bb5+ : Black is in check at ply 5, flip fires, player now owns Black.
    const { ctl, engine, record } = setup({ schedule: [5, 20] });
    ctl.load(record);
    ctl.playerMove("e2", "e4");
    await settle();
    engine.reply("e7e5");
    await settle();
    ctl.playerMove("g1", "f3");
    await settle();
    engine.reply("d7d6");
    await settle();
    ctl.playerMove("f1", "b5");
    await settle();
    const snap = ctl.getSnapshot();
    expect(snap.inCheck).toBe(true);
    expect(snap.record!.playerColor).toBe("b");
    expect(snap.phase).toBe("player");
    expect(snap.record!.result).toBeNull();
    // Only legal check evasions are accepted — no illegal move because of the flip.
    expect(ctl.playerMove("a7", "a6")).toBe(false);
    expect(ctl.playerMove("g8", "f6")).toBe(false);
    expect(ctl.playerMove("c7", "c6")).toBe(true);
  });

  it("does not fire flips after the schedule is exhausted and marks the final one", async () => {
    const { ctl, engine, record, events } = setup({ schedule: [1] });
    ctl.load(record);
    ctl.playerMove("e2", "e4");
    await flush();
    vi.advanceTimersByTime(SETTLE);
    await flush();
    expect(ctl.getSnapshot().flip).toMatchObject({ final: true, toColor: "b" });
    await settle();
    // Player is now Black and it's Black's turn.
    ctl.playerMove("e7", "e5");
    await settle();
    engine.reply();
    await settle();
    expect(events.filter((e) => e.type === "flip")).toHaveLength(1);
    expect(ctl.getSnapshot().record!.flips).toHaveLength(1);
  });
});

describe("results", () => {
  it("player wins by checkmating with the color they inherited", async () => {
    // Player starts White; flips to Black after ply 3 and delivers Fool's mate as Black.
    const { ctl, engine, record } = setup({ schedule: [3] });
    ctl.load(record);
    ctl.playerMove("f2", "f3");
    await settle();
    engine.reply("e7e5");
    await settle();
    ctl.playerMove("g2", "g4");
    await settle();
    expect(ctl.getSnapshot().record!.playerColor).toBe("b");
    expect(ctl.playerMove("d8", "h4")).toBe(true);
    const r = ctl.getSnapshot().record!.result!;
    expect(r).toEqual({ outcome: "win", reason: "checkmate", winningColor: "b" });
    expect(ctl.getSnapshot().phase).toBe("over");
  });

  it("player loses when the AI checkmates them", async () => {
    const { ctl, engine, record } = setup({ start: "w", schedule: [99] });
    ctl.load(record);
    ctl.playerMove("f2", "f3");
    await settle();
    engine.reply("e7e5");
    await settle();
    ctl.playerMove("g2", "g4");
    await settle();
    engine.reply("d8h4");
    await settle();
    expect(ctl.getSnapshot().record!.result).toEqual({ outcome: "loss", reason: "checkmate", winningColor: "b" });
  });

  it("ends the game on checkmate even with flips remaining", async () => {
    const { ctl, engine, record } = setup({ schedule: [4, 10, 16] });
    ctl.load(record);
    ctl.playerMove("f2", "f3");
    await settle();
    engine.reply("e7e5");
    await settle();
    ctl.playerMove("g2", "g4");
    await settle();
    engine.reply("d8h4");
    await settle();
    const snap = ctl.getSnapshot();
    expect(snap.phase).toBe("over");
    expect(snap.record!.flips).toHaveLength(0);
    expect(engine.pendingCount).toBe(0);
  });

  it("detects stalemate as a draw", async () => {
    const { ctl, record } = setup({ schedule: [99] });
    // Sam Loyd's shortest stalemate (10 moves), all moves by whoever owns them.
    const line = "e3 a5 Qh5 Ra6 Qxa5 h5 h4 Rah6 Qxc7 f6 Qxd7+ Kf7 Qxb7 Qd3 Qxb8 Qh7 Qxc8 Kg6 Qe6".split(" ");
    const c = new Chess();
    const moves = line.map((san) => {
      const m = c.move(san);
      return { san: m.san, from: m.from, to: m.to, color: m.color as Color, by: controllerOf(m.color as Color, "w"), flags: m.flags };
    });
    ctl.load({ ...record, moves });
    expect(ctl.getSnapshot().record!.result).toEqual({ outcome: "draw", reason: "stalemate", winningColor: null });
  });
});

describe("async safety", () => {
  it("ignores a stale engine reply after starting a new game", async () => {
    const { ctl, engine, record } = setup({ start: "b", schedule: [99] });
    ctl.load(record);
    const stale = engine.takePending()!;
    const fresh = createGame({ settings: { startChoice: "b", flips: 3, difficulty: "casual" }, seed: 7 });
    fresh.schedule = [99];
    ctl.load(fresh);
    stale.resolve("d2d4");
    await flush();
    engine.reply("e2e4");
    await settle();
    const moves = ctl.getSnapshot().record!.moves;
    expect(moves).toHaveLength(1);
    expect(moves[0].san).toBe("e4");
  });

  it("resigning while the AI is thinking ends the game and discards the reply", async () => {
    const { ctl, engine, record } = setup({ start: "b", schedule: [99] });
    ctl.load(record);
    const pending = engine.takePending()!;
    ctl.resign();
    pending.resolve("e2e4");
    await settle();
    const snap = ctl.getSnapshot();
    expect(snap.phase).toBe("over");
    expect(snap.record!.moves).toHaveLength(0);
    expect(snap.record!.result).toMatchObject({ outcome: "loss", reason: "resignation", winningColor: "w" });
  });

  it("restores a saved game mid-AI-turn and issues exactly one engine request", async () => {
    const { ctl, engine, record } = setup({ schedule: [99] });
    const c = new Chess();
    const m = c.move("e4");
    const restored: GameRecord = {
      ...record,
      moves: [{ san: m.san, from: m.from, to: m.to, color: "w", by: "player", flags: m.flags }],
    };
    ctl.load(restored);
    expect(ctl.getSnapshot().phase).toBe("ai");
    expect(engine.requests).toHaveLength(1);
  });

  it("falls back to a legal move if the engine returns garbage", async () => {
    const { ctl, engine, record } = setup({ start: "b", schedule: [99] });
    ctl.load(record);
    engine.reply("z9z9");
    await settle();
    const snap = ctl.getSnapshot();
    expect(snap.record!.moves).toHaveLength(1);
    expect(snap.engineError).toBe(true);
  });
});

describe("randomized playouts", () => {
  it("never produces an illegal move or a move by the wrong controller across flips", async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const engine = new FakeEngine();
      engine.auto = (req) => randomLegal(req.fen, seed * 7919 + req.fen.length);
      const ctl = new GameController({ engine, timing: { moveSettleMs: 1, flipMs: 1, aiMinThink: false } });
      const record = createGame({ settings: { startChoice: "random", flips: 7, difficulty: "casual" }, seed });
      ctl.load(record);
      let aiMoves = 0;
      for (let step = 0; step < 400; step++) {
        const snap = ctl.getSnapshot();
        if (snap.phase === "over") break;
        if (snap.phase === "player") {
          const uci = randomLegal(snap.fen, seed + step);
          expect(ctl.playerMove(uci.slice(0, 2), uci.slice(2, 4), (uci[4] as "q") || undefined)).toBe(true);
        }
        await flush();
        vi.advanceTimersByTime(2);
        await flush();
      }
      const final = ctl.getSnapshot().record!;
      // Every move replays legally from the start position.
      expect(() => replay(final.moves)).not.toThrow();
      // Every move was made by whoever owned that color at that moment.
      final.moves.forEach((m, i) => {
        const owner = playerColorAtPly(final.startColor, final.flips, i);
        expect(m.by).toBe(controllerOf(m.color, owner));
        if (m.by === "ai") aiMoves++;
      });
      // One engine request per AI move (at most one more if the game is still going).
      expect(engine.requests.length - aiMoves).toBeLessThanOrEqual(1);
      // Flips are spaced and never exceed the plan.
      expect(final.flips.length).toBeLessThanOrEqual(final.schedule.length);
      final.flips.forEach((f, i) => expect(f.ply).toBe(final.schedule[i]));
      ctl.clear();
    }
  }, 60_000);
});

describe("pgn", () => {
  it("keeps standard move numbering across same-controller consecutive plies and marks flips", () => {
    const record = createGame({ settings: { startChoice: "w", flips: 1, difficulty: "casual" }, seed: 1 });
    const c = new Chess();
    const sans = ["e4", "e5", "Nf3", "Nc6"];
    record.moves = sans.map((s, i) => {
      const m = c.move(s);
      return { san: m.san, from: m.from, to: m.to, color: m.color as Color, by: i < 2 ? (i === 0 ? "player" : "ai") : i === 2 ? "ai" : "player", flags: m.flags };
    });
    record.flips = [{ ply: 2, playerColor: "b" }];
    record.playerColor = "b";
    const pgn = toPgn(record).replace(/\s+/g, " ");
    expect(pgn).toContain('[FlipEvents "2:Black"]');
    expect(pgn).toContain("1. e4 e5 {FLIP! Player now controls Black} 2. Nf3 Nc6 *");
    const pgn2 = toPgn({ ...record, flips: [{ ply: 3, playerColor: "b" }] }).replace(/\s+/g, " ");
    expect(pgn2).toContain("2. Nf3 {FLIP! Player now controls Black} 2... Nc6");
  });
});

describe("custom starting position", () => {
  it("plays from a FEN with the AI moving first when it holds the side to move, and numbers moves correctly", async () => {
    const fen = "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 b - - 0 7";
    const { ctl, engine, record } = setup({ start: "w", schedule: [99] });
    ctl.load({ ...record, startFen: fen });
    expect(ctl.getSnapshot().fen).toBe(fen);
    expect(ctl.getSnapshot().phase).toBe("ai"); // Black to move, AI is Black
    engine.reply("h7h6");
    await settle();
    expect(ctl.getSnapshot().phase).toBe("player");
    expect(ctl.playerMove("h2", "h3")).toBe(true);
    const pgn = toPgn(ctl.getSnapshot().record!).replace(/\s+/g, " ");
    expect(pgn).toContain(`[FEN "${fen}"]`);
    expect(pgn).toContain("7... h6 8. h3");
  });
});
