"use client";

import { useEffect, useMemo, useState } from "react";
import { Board } from "./Board";
import { useApp } from "./AppProvider";
import { useHydrated } from "@/lib/client/prefs";
import { pieceIdentities } from "@/lib/chess/rules";
import type { Color } from "@/lib/types";

// An Italian Game middlegame, frozen. The board just keeps changing hands.
const DEMO_FEN = "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 w - - 0 7";

export function HeroBoard() {
  const hydrated = useHydrated();
  const { motion } = useApp();
  const [side, setSide] = useState<Color>("w");
  const ids = useMemo(() => pieceIdentities([]), []);

  useEffect(() => {
    if (!hydrated || motion === "off") return;
    const t = setInterval(() => setSide((s) => (s === "w" ? "b" : "w")), 4200);
    return () => clearInterval(t);
  }, [hydrated, motion]);

  if (!hydrated) return <div className="aspect-square w-full rounded-[8px] bg-raised" />;
  return (
    <div aria-hidden className="pointer-events-none">
      <Board
        fen={DEMO_FEN}
        orientation={side}
        interactive={false}
        movableColor={side}
        lastMove={{ from: "c2", to: "c3" }}
        pieceIds={ids}
        onMove={() => false}
        motion={motion}
        showCoordinates={false}
        showLegalMoves={false}
        label="Demo board"
      />
    </div>
  );
}
