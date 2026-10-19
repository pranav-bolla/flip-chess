import { describe, expect, it } from "vitest";
import { chooseMove, MATE_SCORE, parseInfoLine } from "@/lib/engine/difficulty";
import { parseUci } from "@/lib/game/controller";
import { dailyChallenge, dailyNumberFor } from "@/lib/daily/daily";
import { shareText } from "@/lib/game/share";

const lines = [
  { move: "e2e4", score: 40 },
  { move: "d2d4", score: 35 },
  { move: "g1f3", score: 20 },
  { move: "a2a3", score: -200 },
];

describe("engine move selection", () => {
  it("is deterministic for the same seed and position", () => {
    for (const d of ["beginner", "casual", "intermediate", "advanced"] as const) {
      expect(chooseMove(lines, d, 9, "fen")).toBe(chooseMove(lines, d, 9, "fen"));
    }
  });
  it("advanced always plays the best line", () => {
    for (let s = 0; s < 50; s++) expect(chooseMove(lines, "advanced", s, "fen")).toBe("e2e4");
  });
  it("never ignores a found mate", () => {
    const withMate = [...lines, { move: "h5f7", score: MATE_SCORE - 1 }];
    for (let s = 0; s < 50; s++) expect(chooseMove(withMate, "beginner", s, "x")).toBe("h5f7");
  });
  it("only picks moves within the difficulty tolerance", () => {
    for (let s = 0; s < 200; s++) expect(chooseMove(lines, "casual", s, "f")).not.toBe("a2a3");
  });
  it("parses UCI info lines, including mates", () => {
    expect(parseInfoLine("info depth 8 seldepth 10 multipv 2 score cp -31 nodes 1 pv e7e5 g1f3")).toEqual({
      index: 2,
      depth: 8,
      line: { move: "e7e5", score: -31 },
    });
    expect(parseInfoLine("info depth 3 multipv 1 score mate 2 pv d8h4")!.line.score).toBe(MATE_SCORE - 2);
    expect(parseInfoLine("info string hello")).toBeNull();
    expect(parseUci("e7e8q")).toEqual({ from: "e7", to: "e8", promotion: "q" });
    expect(parseUci("(none)")).toBeNull();
  });
});

describe("daily", () => {
  it("derives the same challenge for the same day", () => {
    const a = dailyChallenge(new Date(2026, 9, 19, 8));
    const b = dailyChallenge(new Date(2026, 9, 19, 23));
    expect(a).toEqual(b);
    expect(a.number).toBe(dailyNumberFor("2026-10-19"));
    expect(dailyNumberFor("2026-09-01")).toBe(1);
  });
  it("shares a result without revealing the flip schedule", () => {
    const text = shareText({
      sessionId: "x", mode: "daily", dailyNumber: 42, outcome: "win", reason: "checkmate", winningColor: "b",
      startColor: "w", finalColor: "b", flipsPlanned: 3, flipsCompleted: 3, moves: 34, plies: 67, difficulty: "casual", endedAt: 0,
    });
    expect(text).toBe("FLIP CHESS ♟️\nDaily #042\n\n🏆 WIN\n🔄 🔄 🔄\n♟️ Finished as Black\n⏱️ 34 moves\n\nCan you survive the flip?");
  });
});

describe("daily positions", () => {
  it("are all legal, named, and none is already decided", async () => {
    const { dailyPositions } = await import("@/lib/daily/positions");
    const { Chess } = await import("chess.js");
    const list = dailyPositions();
    expect(list.length).toBeGreaterThanOrEqual(30);
    for (const p of list) {
      const c = new Chess(p.fen);
      expect(c.isGameOver()).toBe(false);
      expect(p.name.length).toBeGreaterThan(3);
    }
    expect(new Set(list.map((p) => p.fen)).size).toBe(list.length);
  });
  it("gives everyone the same position on a day and cycles without repeats", () => {
    const a = dailyChallenge(new Date(2026, 9, 19, 1));
    const b = dailyChallenge(new Date(2026, 9, 19, 22));
    expect(a.position).toEqual(b.position);
    const seen = new Set<string>();
    for (let d = 0; d < 30; d++) seen.add(dailyChallenge(new Date(2026, 9, 1 + d, 12)).position.fen);
    expect(seen.size).toBe(30);
  });
});
