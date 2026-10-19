"use client";

import { Dialog } from "./Dialog";
import { Segmented } from "./Segmented";
import { updatePrefs, usePrefs } from "@/lib/client/prefs";
import type { Difficulty, FlipCount, GameSettings, StartColorChoice } from "@/lib/types";

export function SetupDialog({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart: (s: GameSettings) => void }) {
  const prefs = usePrefs();
  const s = prefs.setup;
  const set = (patch: Partial<GameSettings>) => updatePrefs({ setup: { ...s, ...patch } });
  return (
    <Dialog open={open} onClose={onClose} title="New game">
      <div className="space-y-4 px-5 pb-5">
        <Segmented<StartColorChoice>
          label="Start as"
          value={s.startChoice}
          onChange={(startChoice) => set({ startChoice })}
          options={[
            { value: "w", label: "White" },
            { value: "b", label: "Black" },
            { value: "random", label: "Random" },
          ]}
        />
        <Segmented<FlipCount>
          label="Flips"
          value={s.flips}
          onChange={(flips) => set({ flips })}
          options={[1, 3, 5, 7].map((n) => ({ value: n as FlipCount, label: String(n) }))}
        />
        <Segmented<Difficulty>
          label="Stockfish"
          value={s.difficulty}
          onChange={(difficulty) => set({ difficulty })}
          options={[
            { value: "beginner", label: "Beginner" },
            { value: "casual", label: "Casual" },
            { value: "intermediate", label: "Intermediate" },
            { value: "advanced", label: "Advanced" },
          ]}
        />
        <button onClick={() => onStart(s)} className="btn btn-primary mt-2 h-10 w-full text-[14px]">
          Start game
        </button>
      </div>
    </Dialog>
  );
}
