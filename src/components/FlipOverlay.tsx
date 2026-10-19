"use client";

import { AnimatePresence, motion } from "motion/react";
import type { FlipAnimation } from "@/lib/game/controller";
import type { MotionPref } from "@/lib/storage/storage";
import { colorName } from "@/lib/types";

/**
 * The FLIP moment: darken everything except the board while it turns.
 * Pointer events are swallowed for the duration so taps can't leak through.
 */
export function FlipOverlay({ flip }: { flip: FlipAnimation | null }) {
  return (
    <AnimatePresence>
      {flip && (
        <motion.div
          key={flip.id}
          className="fixed inset-0 z-40 bg-[#07080a]/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          transition={{ duration: 0.15 }}
          aria-hidden
          onPointerDown={(e) => e.preventDefault()}
        />
      )}
    </AnimatePresence>
  );
}

/** "FLIP!" slams in over the board, then the new color is announced. */
export function FlipLabel({ flip, motion: pref }: { flip: FlipAnimation | null; motion: MotionPref }) {
  const full = pref === "full";
  return (
    <AnimatePresence>
      {flip && (
        <motion.div
          key={flip.id}
          className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-4"
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          role="status"
          aria-live="assertive"
        >
          <motion.div
            className="text-[clamp(56px,15vw,132px)] font-black leading-none tracking-[-0.04em] text-text"
            style={{ textShadow: "0 8px 40px rgb(0 0 0 / 0.65), 0 2px 0 rgb(0 0 0 / 0.25)" }}
            initial={full ? { scale: 0.4, opacity: 0, rotate: -8 } : { opacity: 0 }}
            animate={
              full
                ? { scale: [0.4, 1.12, 1, 1, 0.92], opacity: [0, 1, 1, 1, 0], rotate: [-8, 3, 0, 0, 0] }
                : { opacity: [0, 1, 1, 0] }
            }
            transition={{ duration: 0.85, times: full ? [0, 0.22, 0.38, 0.75, 1] : [0, 0.2, 0.75, 1], ease: "easeOut" }}
          >
            FLIP!
          </motion.div>
          <motion.div
            className="rounded-full border border-flip/40 bg-bg/90 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.22em] text-flip shadow-xl shadow-black/50 sm:text-[13px]"
            initial={{ opacity: 0, y: full ? 14 : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 380, damping: 26 }}
          >
            You are now {colorName(flip.toColor)}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
