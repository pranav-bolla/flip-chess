"use client";

import { AnimatePresence, motion } from "motion/react";
import type { Countdown } from "@/lib/duel/rules";

/**
 * The duel's main signal: how many full moves until everyone swaps sides.
 * Turns gold and breathes gently on the last full move.
 */
export function DuelCountdown({ c, flipEvery, flipping, over, flips }: { c: Countdown; flipEvery: number; flipping: boolean; over: boolean; flips: number }) {
  if (over) {
    return (
      <div className="flex h-[52px] flex-col justify-center">
        <div className="text-[16px] font-semibold text-muted">Game over</div>
        <div className="text-[12px] text-faint">
          {flips} flip{flips === 1 ? "" : "s"} · every {flipEvery} moves
        </div>
      </div>
    );
  }
  if (c.movesLeft === null) {
    return (
      <div className="flex h-[52px] flex-col justify-center">
        <div className="text-[16px] font-semibold text-muted">No more flips</div>
        <div className="text-[12px] text-faint">Final sides. Play it out.</div>
      </div>
    );
  }
  const final = c.movesLeft === 1;
  const segments = Math.min(flipEvery, 15);
  const filled = flipEvery <= 15 ? c.progress : Math.round((c.progress / flipEvery) * segments);
  const label = flipping ? "Flip!" : `Flip in ${c.movesLeft} move${c.movesLeft === 1 ? "" : "s"}`;
  const sub = flipping
    ? "Sides swapped"
    : final
      ? c.flipAfterThisBlackMove
        ? "Final moves before flip · swaps after Black moves"
        : "Final moves before flip"
      : c.flipsLeft === null
        ? `Every ${flipEvery} full moves`
        : `${c.flipsLeft} flip${c.flipsLeft === 1 ? "" : "s"} left`;

  return (
    <div className="flex h-[52px] flex-col justify-center" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <motion.div
          className={`text-[20px] font-semibold tracking-[-0.01em] tabular-nums ${final || flipping ? "text-flip" : "text-text"}`}
          animate={final && !flipping ? { opacity: [1, 0.6, 1] } : { opacity: 1 }}
          transition={final && !flipping ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }} className="inline-block">
              {label}
            </motion.span>
          </AnimatePresence>
        </motion.div>
        <span className={`text-[12px] ${final ? "text-flip/80" : "text-faint"}`}>{sub}</span>
      </div>
      <div className="mt-2 flex gap-[3px]" aria-hidden>
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className={`h-[3px] flex-1 rounded-full transition-colors duration-300 ${
              i < filled ? (final ? "bg-flip" : "bg-text/70") : final ? "bg-flip/20" : "bg-white/10"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
