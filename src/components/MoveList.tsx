"use client";

import { Fragment, useEffect, useRef } from "react";
import { moveNumberAt } from "@/lib/chess/rules";
import type { FlipEvent, MoveRecord } from "@/lib/types";
import { colorName } from "@/lib/types";

type Row =
  | { kind: "moves"; number: number; white?: number; black?: number }
  | { kind: "flip"; flip: FlipEvent };

function buildRows(moves: readonly MoveRecord[], flips: readonly FlipEvent[], startFen?: string): Row[] {
  const rows: Row[] = [];
  let current: Extract<Row, { kind: "moves" }> | null = null;
  moves.forEach((m, i) => {
    const { number } = moveNumberAt(i, startFen);
    if (m.color === "w" || !current || current.number !== number) {
      current = { kind: "moves", number };
      rows.push(current);
    }
    if (m.color === "w") current.white = i;
    else current.black = i;
    const flip = flips.find((f) => f.ply === i + 1);
    if (flip) {
      rows.push({ kind: "flip", flip });
      current = null;
    }
  });
  return rows;
}

interface MoveListProps {
  moves: readonly MoveRecord[];
  flips: readonly FlipEvent[];
  /** Custom starting position, for correct move numbers. */
  startFen?: string;
  /** Plies shown on the board. */
  viewPly: number;
  onSelect: (ply: number) => void;
  className?: string;
}

function moveLabel(m: MoveRecord, i: number, startFen?: string) {
  return `Move ${moveNumberAt(i, startFen).number}${m.color === "b" ? " black" : ""}: ${m.san}, ${m.by === "player" ? "you" : "opponent"}`;
}

/**
 * Standard-numbered move list. Your moves are bright, the AI's are muted, and
 * a flip appears as a divider at the exact ply it happened.
 */
export function MoveList({ moves, flips, startFen, viewPly, onSelect, className = "" }: MoveListProps) {
  const rows = buildRows(moves, flips, startFen);
  const scroller = useRef<HTMLDivElement>(null);
  const live = viewPly === moves.length;

  useEffect(() => {
    const el = scroller.current;
    if (el && live) el.scrollTop = el.scrollHeight;
  }, [moves.length, flips.length, live]);

  const cell = (i: number | undefined, placeholder: boolean) => {
    if (i == null) return <span className="px-1.5 text-faint">{placeholder ? "…" : ""}</span>;
    const m = moves[i];
    const active = viewPly === i + 1;
    return (
      <button
        onClick={() => onSelect(i + 1)}
        aria-current={active ? "step" : undefined}
        aria-label={moveLabel(m, i, startFen)}
        className={`rounded-[4px] px-1.5 py-[3px] text-left text-[13px] tabular-nums transition-colors duration-100 ${
          active ? "bg-white/[0.09] text-text" : m.by === "player" ? "text-text hover:bg-hover" : "text-muted hover:bg-hover"
        }`}
      >
        {m.san}
      </button>
    );
  };

  return (
    <div ref={scroller} className={`scrollbar-thin overflow-y-auto ${className}`}>
      {rows.length === 0 ? (
        <p className="py-1 text-[13px] text-faint">No moves yet</p>
      ) : (
        <ol>
          {rows.map((r, idx) =>
            r.kind === "moves" ? (
              <li key={idx} className="grid grid-cols-[2rem_1fr_1fr] items-center">
                <span className="text-[12px] tabular-nums text-faint">{r.number}.</span>
                {cell(r.white, r.black != null)}
                {cell(r.black, false)}
              </li>
            ) : (
              <li key={idx} className="my-1 flex items-center gap-2 text-[12px] text-flip">
                <span>Flip</span>
                <span className="text-faint">you → {colorName(r.flip.playerColor)}</span>
                <span className="h-px flex-1 bg-line" />
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}

/** Single-line, horizontally scrolling variant for small screens. */
export function MoveStrip({ moves, flips, startFen, viewPly, onSelect, className = "" }: MoveListProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const live = viewPly === moves.length;
  useEffect(() => {
    const el = scroller.current;
    if (el && live) el.scrollLeft = el.scrollWidth;
  }, [moves.length, live]);

  return (
    <div ref={scroller} className={`no-scrollbar flex items-center overflow-x-auto whitespace-nowrap ${className}`}>
      {moves.length === 0 && <span className="text-[13px] text-faint">No moves yet</span>}
      {moves.map((m, i) => {
        const active = viewPly === i + 1;
        const flip = flips.find((f) => f.ply === i + 1);
        const showNumber = m.color === "w" || i === 0 || flips.some((f) => f.ply === i);
        return (
          <Fragment key={i}>
            {showNumber && (
              <span className="pl-1.5 text-[12px] tabular-nums text-faint">
                {moveNumberAt(i, startFen).number}
                {m.color === "w" ? "." : "…"}
              </span>
            )}
            <button
              onClick={() => onSelect(i + 1)}
              aria-current={active ? "step" : undefined}
              aria-label={moveLabel(m, i, startFen)}
              className={`rounded-[4px] px-1.5 py-1 text-[13px] ${active ? "bg-white/[0.09] text-text" : m.by === "player" ? "text-text" : "text-muted"}`}
            >
              {m.san}
            </button>
            {flip && <span className="mx-1 text-[12px] text-flip">Flip</span>}
          </Fragment>
        );
      })}
    </div>
  );
}
