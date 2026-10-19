import { describe, expect, it } from "vitest";
import { defaultScheduleOptions, generateFlipSchedule, isFlipDue } from "@/lib/flip/schedule";
import { FLIP_COUNTS } from "@/lib/types";

describe("flip schedule", () => {
  it("is reproducible from the seed", () => {
    for (const n of FLIP_COUNTS) {
      expect(generateFlipSchedule(1234, n)).toEqual(generateFlipSchedule(1234, n));
    }
    expect(generateFlipSchedule(1, 3)).not.toEqual(generateFlipSchedule(2, 3));
  });

  it("has exactly N strictly increasing, spaced checkpoints inside the window", () => {
    for (const n of FLIP_COUNTS) {
      const opts = defaultScheduleOptions(n);
      for (let seed = 0; seed < 500; seed++) {
        const s = generateFlipSchedule(seed, n);
        expect(s).toHaveLength(n);
        expect(s[0]).toBeGreaterThanOrEqual(opts.windowStart);
        expect(s[n - 1]).toBeLessThanOrEqual(opts.windowEnd);
        for (let i = 1; i < n; i++) expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(opts.minGap);
      }
    }
  });

  it("produces flips on both White and Black boundaries across seeds", () => {
    const parities = new Set<number>();
    for (let seed = 0; seed < 50; seed++) generateFlipSchedule(seed, 3).forEach((p) => parities.add(p % 2));
    expect(parities).toEqual(new Set([0, 1]));
  });

  it("throws when the window cannot fit the flips", () => {
    expect(() => generateFlipSchedule(1, 5, { windowStart: 0, windowEnd: 10, minGap: 6 })).toThrow();
  });

  it("never fires two flips at the same boundary", () => {
    const schedule = [10, 16];
    expect(isFlipDue(9, schedule, 0, -1)).toBe(false);
    expect(isFlipDue(10, schedule, 0, -1)).toBe(true);
    // Just flipped at ply 10: even if the next checkpoint had passed, no second flip at 10.
    expect(isFlipDue(10, [10, 10], 1, 10)).toBe(false);
    expect(isFlipDue(16, schedule, 1, 10)).toBe(true);
    expect(isFlipDue(30, schedule, 2, 16)).toBe(false);
  });
});
