"use client";

import { AnimatePresence, motion } from "motion/react";
import type { DuelFlip } from "@/lib/duel/rules";

/**
 * The duel's main signal. Before the one flip: a standing warning that it could
 * come on any move (the server alone knows when). After: final sides.
 */
export function DuelFlipStatus({ flip, flipping, over }: { flip: DuelFlip | undefined; flipping: boolean; over: boolean }) {
  let label: string;
  let sub: string;
  if (flipping) {
    label = "Flip!";
    sub = "Sides swapped for good";
  } else if (over) {
    label = "Game over";
    sub = flip ? `Flipped after move ${flip.ply / 2}` : "Ended before the flip";
  } else if (flip) {
    label = "Flipped";
    sub = `After move ${flip.ply / 2} · final sides, play it out`;
  } else {
    label = "One flip, any move";
    sub = "Nobody knows when · sides swap for good";
  }
  const pending = !flip && !over && !flipping;

  return (
    <div className="flex h-[52px] flex-col justify-center" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <div className={`flex items-center gap-2 text-[20px] font-semibold tracking-[-0.01em] ${flipping || pending ? "text-flip" : over ? "text-muted" : "text-text"}`}>
          {pending && (
            <motion.span
              aria-hidden
              className="size-2 rounded-full bg-flip"
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }} className="inline-block">
              {label}
            </motion.span>
          </AnimatePresence>
        </div>
        <span className="text-right text-[12px] text-faint">{sub}</span>
      </div>
    </div>
  );
}
