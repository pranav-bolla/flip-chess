import { describe, expect, it } from "vitest";
import { aiColorOf, controllerOf, flipOwnership, playerColorAtPly } from "@/lib/flip/ownership";

describe("ownership", () => {
  it("maps colors to controllers independently of turn order", () => {
    expect(controllerOf("w", "w")).toBe("player");
    expect(controllerOf("b", "w")).toBe("ai");
    expect(controllerOf("w", "b")).toBe("ai");
    expect(aiColorOf("b")).toBe("w");
  });

  it("swaps control on flip", () => {
    expect(flipOwnership("w", 9)).toEqual({ ply: 9, playerColor: "b" });
    expect(flipOwnership("b", 20)).toEqual({ ply: 20, playerColor: "w" });
  });

  it("reconstructs who controlled what at any ply", () => {
    const flips = [
      { ply: 8, playerColor: "b" as const },
      { ply: 15, playerColor: "w" as const },
    ];
    expect(playerColorAtPly("w", flips, 7)).toBe("w");
    expect(playerColorAtPly("w", flips, 8)).toBe("b");
    expect(playerColorAtPly("w", flips, 14)).toBe("b");
    expect(playerColorAtPly("w", flips, 15)).toBe("w");
  });
});
