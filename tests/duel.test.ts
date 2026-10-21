import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  applyDuelMove,
  colorOfSeat,
  colorOfSeatAtPly,
  FLIP_WINDOW,
  newDuelGame,
  randomFlipPly,
  type DuelGame,
  type Seat,
} from "@/lib/duel/rules";
import { FLIP_LOCK_MS, RoomStore } from "@/lib/duel/rooms";

const LOCK = 1000;

/** Play SAN moves, each by whichever seat controls the side to move. Time advances past any flip lock. */
function play(sans: string, flipAtPly = 10) {
  let game = newDuelGame("g");
  const chess = new Chess();
  let now = 0;
  const flippedAt: number[] = [];
  for (const san of sans.split(" ").filter(Boolean)) {
    const legal = new Chess(chess.fen()).move(san);
    const seat = (chess.turn() === "w" ? game.whiteSeat : 1 - game.whiteSeat) as Seat;
    now += LOCK + 1;
    const out = applyDuelMove(game, chess, seat, legal.from, legal.to, legal.promotion as "q" | undefined, now, LOCK, flipAtPly);
    if (typeof out === "string") throw new Error(`${san}: ${out}`);
    game = out.game;
    if (out.flipped) flippedAt.push(game.moves.length);
  }
  return { game, chess, now, flippedAt };
}

describe("the single secret flip", () => {
  it("flips exactly once, right after Black completes the chosen move", () => {
    let r = play("e4 e5 Nf3 Nc6 Bc4", 6);
    expect(r.game.flips).toHaveLength(0);
    r = play("e4 e5 Nf3 Nc6 Bc4 Bc5", 6);
    expect(r.flippedAt).toEqual([6]);
    expect(r.game.whiteSeat).toBe(1);
  });

  it("never flips again, however long the game goes", () => {
    const line = "Nf3 Nf6 Nc3 Nc6 e3 e6 Be2 Be7 a3 a6 b3 b6 h3 h6 g3 g6";
    const r = play(line, 4);
    expect(r.flippedAt).toEqual([4]);
    expect(r.game.whiteSeat).toBe(1);
  });

  it("draws the flip after Black's move, inside the window", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(randomFlipPly(() => i / 200));
    for (const ply of seen) {
      expect(ply % 2).toBe(0);
      expect(ply / 2).toBeGreaterThanOrEqual(FLIP_WINDOW.earliest);
      expect(ply / 2).toBeLessThanOrEqual(FLIP_WINDOW.latest);
    }
    expect(seen.size).toBe(FLIP_WINDOW.latest - FLIP_WINDOW.earliest + 1);
  });
});

describe("duel turn order and ownership", () => {
  it("gives the same human two turns in a row across a flip", () => {
    const { game, chess, now } = play("e4 e5 Nf3 Nc6", 4);
    // Seat 1 played Black's 2nd move; the flip handed it White, and White is to move.
    expect(game.moves[3].seat).toBe(1);
    expect(colorOfSeat(game, 1)).toBe("w");
    expect(chess.turn()).toBe("w");
    expect(applyDuelMove(game, chess, 0, "f1", "c4", undefined, now + LOCK + 1, LOCK, 4)).toBe("not-your-turn");
    const out = applyDuelMove(game, chess, 1, "f1", "c4", undefined, now + LOCK + 1, LOCK, 4);
    expect(typeof out).toBe("object");
  });

  it("refuses moves while the flip plays out", () => {
    let game = newDuelGame("g");
    const chess = new Chess();
    game = (applyDuelMove(game, chess, 0, "e2", "e4", undefined, 0, LOCK, 2) as { game: DuelGame }).game;
    game = (applyDuelMove(game, chess, 1, "e7", "e5", undefined, 10, LOCK, 2) as { game: DuelGame }).game;
    expect(game.flips).toHaveLength(1);
    expect(applyDuelMove(game, chess, 1, "g1", "f3", undefined, 10 + LOCK - 1, LOCK, 2)).toBe("flip-in-progress");
    expect(typeof applyDuelMove(game, chess, 1, "g1", "f3", undefined, 10 + LOCK, LOCK, 2)).toBe("object");
  });

  it("reconstructs who held which color at every ply", () => {
    const { game } = play("e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6", 4);
    expect(game.flips.map((f) => f.ply)).toEqual([4]);
    expect(colorOfSeatAtPly(game, 0, 3)).toBe("w");
    expect(colorOfSeatAtPly(game, 0, 4)).toBe("b");
    expect(colorOfSeatAtPly(game, 0, 8)).toBe("b");
  });

  it("switches control while the side to move is in check, and only evasions are legal", () => {
    // 2...Bb4+ is Black's 2nd move and triggers the flip; White is in check and now belongs to seat 1.
    const { game, chess, now } = play("d4 e5 Nf3 Bb4+", 4);
    expect(game.flips).toHaveLength(1);
    expect(chess.inCheck()).toBe(true);
    expect(game.result).toBeNull();
    expect(applyDuelMove(game, chess, 1, "a2", "a3", undefined, now + LOCK + 1, LOCK, 4)).toBe("illegal");
    expect(typeof applyDuelMove(game, chess, 1, "c2", "c3", undefined, now + LOCK + 1, LOCK, 4)).toBe("object");
  });

  it("records a promotion on the move that triggers the flip", () => {
    const { game, flippedAt } = play("a3 b5 a4 bxa4 b3 axb3 Bb2 bxc2 Nc3 cxd1=Q+", 10);
    expect(flippedAt).toEqual([10]);
    expect(game.moves[9]).toMatchObject({ san: "cxd1=Q+", promotion: "q", seat: 1 });
    expect(game.result).toBeNull();
  });
});

describe("duel results", () => {
  it("checkmate just before a flip ends the game with no flip", () => {
    const { game, flippedAt } = play("f3 e5 g4 Qh4#", 4);
    expect(flippedAt).toEqual([]);
    expect(game.result).toEqual({ reason: "checkmate", winningColor: "b", winnerSeat: 1 });
  });

  it("the winner is whoever controlled the mating color, not who started with it", () => {
    // Flip after the first full move: seat 0 starts White but delivers mate as Black.
    const { game } = play("f3 e5 g4 Qh4#", 2);
    expect(game.flips).toHaveLength(1);
    expect(game.moves[3].seat).toBe(0);
    expect(game.result).toEqual({ reason: "checkmate", winningColor: "b", winnerSeat: 0 });
  });

  it("a check that isn't mate keeps the game going", () => {
    const { game } = play("e4 e5 Nf3 d6 Bb5+");
    expect(game.result).toBeNull();
  });

  it("detects threefold repetition", () => {
    const { game } = play("Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8", 20);
    expect(game.result).toMatchObject({ reason: "threefold", winnerSeat: null, winningColor: null });
  });

  it("rejects every move once the game is over", () => {
    const { game, chess } = play("f3 e5 g4 Qh4#");
    expect(applyDuelMove(game, chess, 0, "a2", "a3", undefined, 1e9, LOCK, 10)).toBe("game-over");
  });
});

describe("rooms", () => {
  const A = "token-aaaaaaaaaaaaaaaa";
  const B = "token-bbbbbbbbbbbbbbbb";
  const C = "token-cccccccccccccccc";

  function setup(flipAtPly = 4) {
    let t = 0;
    const store = new RoomStore(() => t, Math.random, () => flipAtPly);
    const code = store.create(A, "Ana");
    return { store, code, advance: (ms: number) => (t += ms), id: () => store.snapshot(code, A)!.game.id };
  }

  it("seats the creator and one friend, keeps seats on reconnect, and lets others watch", () => {
    const { store, code } = setup();
    expect(store.join(code, A, "Ana")).toBe(0);
    expect(store.join(code, B, "Ben")).toBe(1);
    expect(store.join(code, B, "Ben")).toBe(1);
    expect(store.join(code, C, "Cy")).toBeNull();
    expect(store.join("ZZZZZZ", A, "Ana")).toBe("no-room");
    expect(store.snapshot(code, C)!.you).toBeNull();
    // Tokens never appear in snapshots.
    expect(JSON.stringify(store.snapshot(code, A))).not.toContain("token-");
  });

  it("waits for the opponent, refuses spectators and stale game ids", () => {
    const { store, code, id } = setup();
    store.join(code, A, "Ana");
    expect(store.move(code, A, id(), "e2", "e4")).toBe("waiting-for-opponent");
    store.join(code, B, "Ben");
    expect(store.move(code, C, id(), "e2", "e4")).toBe("not-seated");
    expect(store.move(code, A, "old-game", "e2", "e4")).toBe("game-over");
    expect(store.move(code, A, id(), "e2", "e4")).toEqual({ flipped: false });
  });

  it("never duplicates a flip when players reconnect or refresh", () => {
    const { store, code, id, advance } = setup(2);
    store.join(code, A, "Ana");
    store.join(code, B, "Ben");
    store.move(code, A, id(), "e2", "e4");
    expect(store.move(code, B, id(), "e7", "e5")).toEqual({ flipped: true });
    for (let i = 0; i < 3; i++) {
      store.join(code, A, "Ana");
      store.join(code, B, "Ben");
    }
    advance(FLIP_LOCK_MS);
    const snap = store.snapshot(code, A)!;
    expect(snap.game.flips).toHaveLength(1);
    expect(snap.game.whiteSeat).toBe(1);
  });

  it("allows resigning during the flip lock", () => {
    const { store, code, id } = setup(2);
    store.join(code, A, "Ana");
    store.join(code, B, "Ben");
    store.move(code, A, id(), "e2", "e4");
    store.move(code, B, id(), "e7", "e5");
    expect(store.resign(code, A, id())).toBe(true);
    // Seat 0 holds Black after the flip, so seat 1 wins with White.
    expect(store.snapshot(code, A)!.game.result).toEqual({ reason: "resignation", winnerSeat: 1, winningColor: "w" });
  });

  it("starts a rematch only when both agree, with starting colors swapped", () => {
    const { store, code, id } = setup();
    store.join(code, A, "Ana");
    store.join(code, B, "Ben");
    expect(store.rematch(code, A)).toBe("bad-request"); // game not over
    store.resign(code, B, id());
    expect(store.rematch(code, A)).toEqual({ started: false });
    expect(store.snapshot(code, B)!.rematchVotes).toEqual([0]);
    expect(store.rematch(code, B)).toEqual({ started: true });
    const snap = store.snapshot(code, A)!;
    expect(snap.game.startWhiteSeat).toBe(1);
    expect(snap.game.moves).toHaveLength(0);
    expect(snap.game.result).toBeNull();
  });

  it("keeps the flip point secret and draws a new one for each game", () => {
    let t = 0;
    const plies = [14, 30];
    const store = new RoomStore(() => t++, Math.random, () => plies.shift()!);
    const code = store.create(A, "Ana");
    store.join(code, A, "Ana");
    store.join(code, B, "Ben");
    const json = JSON.stringify(store.snapshot(code, B));
    expect(json).not.toContain("flipAt");
    expect(json).not.toMatch(/\b14\b/);
    store.resign(code, A, store.snapshot(code, A)!.game.id);
    store.rematch(code, A);
    store.rematch(code, B);
    expect(plies).toEqual([]);
  });

  it("sweeps idle empty rooms", () => {
    const { store, code, advance } = setup();
    advance(10_000);
    store.sweep(5_000);
    expect(store.has(code)).toBe(false);
  });
});
