import { createRng, mixSeed } from "../rng";

/**
 * Flip scheduling.
 *
 * A schedule is a strictly increasing list of ply counts. A flip fires at the
 * first safe boundary where the number of completed plies reaches the next
 * checkpoint. Checkpoints are drawn uniformly from an opening/middlegame
 * window with a guaranteed minimum gap, using a seeded RNG — the schedule
 * depends only on the seed and settings, never on the state of the game.
 */

export interface ScheduleOptions {
  /** Earliest ply (inclusive) at which a flip may fire. */
  windowStart: number;
  /** Latest ply (inclusive) at which a flip may fire. */
  windowEnd: number;
  /** Minimum number of plies between consecutive flips. */
  minGap: number;
}

/** Default window: no flips before move 4; the window grows with flip count. */
export function defaultScheduleOptions(flips: number): ScheduleOptions {
  const minGap = 6; // three full moves between flips
  const windowStart = 7; // after White's 4th move at the earliest
  const span = Math.max(26, flips * 12);
  return { windowStart, windowEnd: windowStart + span, minGap };
}

export function generateFlipSchedule(
  seed: number,
  flips: number,
  options: ScheduleOptions = defaultScheduleOptions(flips),
): number[] {
  if (flips <= 0) return [];
  const { windowStart, windowEnd, minGap } = options;
  const slack = windowEnd - windowStart - (flips - 1) * minGap;
  if (slack < 0) {
    throw new Error("Flip window too small for the requested number of flips");
  }
  // Stars and bars: choose `flips` offsets in [0, slack], sort, then spread
  // them out by the minimum gap. Uniform over all valid schedules' shapes and
  // guarantees spacing without rejection sampling.
  const rng = createRng(mixSeed("flip-schedule", seed, flips));
  const offsets = Array.from({ length: flips }, () => Math.floor(rng() * (slack + 1)));
  offsets.sort((a, b) => a - b);
  return offsets.map((o, i) => windowStart + o + i * minGap);
}

/**
 * Whether a flip is due at the current boundary.
 *
 * @param plies       completed plies in the game
 * @param schedule    the hidden schedule
 * @param flipsDone   flips already applied
 * @param lastFlipPly ply at which the previous flip fired (or -1)
 *
 * At most one flip can fire per boundary: a flip is never due at the same ply
 * as the previous one, so checkpoints can never fire simultaneously.
 */
export function isFlipDue(
  plies: number,
  schedule: readonly number[],
  flipsDone: number,
  lastFlipPly: number,
): boolean {
  if (flipsDone >= schedule.length) return false;
  if (plies <= lastFlipPly) return false;
  return plies >= schedule[flipsDone];
}
