"use client";

import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { Color, PromotionPiece } from "@/lib/types";
import type { MotionPref } from "@/lib/storage/storage";

const FILES = "abcdefgh";
const PIECE_NAMES: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

export interface BoardProps {
  fen: string;
  /** Color shown at the bottom. Changing it triggers the flip rotation. */
  orientation: Color;
  /** Whether the user may move pieces of `movableColor` right now. */
  interactive: boolean;
  movableColor: Color;
  lastMove: { from: string; to: string } | null;
  /** Stable piece identities by square, for smooth movement animation. */
  pieceIds: Map<string, string>;
  onMove: (from: string, to: string, promotion?: PromotionPiece) => boolean;
  motion: MotionPref;
  showCoordinates: boolean;
  showLegalMoves: boolean;
  /** Label for screen readers. */
  label?: string;
}

interface DragState {
  from: string;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  wasSelected: boolean;
}

function squareAt(col: number, row: number, orientation: Color): string {
  const file = orientation === "w" ? col : 7 - col;
  const rank = orientation === "w" ? 8 - row : row + 1;
  return `${FILES[file]}${rank}`;
}

function coordsOf(square: string, orientation: Color): { col: number; row: number } {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return orientation === "w" ? { col: file, row: 8 - rank } : { col: 7 - file, row: rank - 1 };
}

/** Board turn: a soft spring with a little life in it. */
const FLIP_SPRING = { type: "spring" as const, stiffness: 120, damping: 17, mass: 1 };
/** Piece travel: decelerating, short, no bounce. */
const MOVE_TWEEN = { duration: 0.17, ease: [0.2, 0.7, 0.3, 1] as const };

export function Board({
  fen,
  orientation,
  interactive,
  movableColor,
  lastMove,
  pieceIds,
  onMove,
  motion: motionPref,
  showCoordinates,
  showLegalMoves,
  label = "Chess board",
}: BoardProps) {
  const chess = useMemo(() => new Chess(fen), [fen]);
  const board = useMemo(() => chess.board(), [chess]);
  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [instantId, setInstantId] = useState<string | null>(null);
  const drag = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const boardRef = useRef<HTMLDivElement>(null);

  // ── Flip rotation ───────────────────────────────────────────────────
  // The board re-renders in its new orientation and is immediately rotated
  // back by -180°, then springs to 0°. Pieces counter-rotate by the same
  // motion value so they stay upright for the whole animation.
  const rotation = useMotionValue(0);
  const counter = useTransform(rotation, (r) => -r);
  const scale = useTransform(rotation, [-180, -90, 0], [1, 0.9, 1]);
  const coordOpacity = useTransform(rotation, [-180, -12, 0], [0, 0, 1]);
  const prevOrientation = useRef(orientation);

  useLayoutEffect(() => {
    if (prevOrientation.current === orientation) return;
    prevOrientation.current = orientation;
    if (motionPref === "full") {
      rotation.set(-180);
      const controls = animate(rotation, 0, FLIP_SPRING);
      return () => controls.stop();
    }
    rotation.set(0);
  }, [orientation, motionPref, rotation]);

  // Reset transient selection whenever the position or permissions change.
  const resetKey = `${fen}|${interactive}|${orientation}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setSelected(null);
    setPromotion(null);
  }

  // A drag-dropped piece lands instantly; later moves of it animate normally again.
  useEffect(() => {
    if (!instantId) return;
    const t = setTimeout(() => setInstantId(null), 80);
    return () => clearTimeout(t);
  }, [fen, instantId]);

  const legalBySquare = useMemo(() => {
    const map = new Map<string, { to: string; promotion?: string; capture: boolean }[]>();
    if (!interactive) return map;
    for (const m of chess.moves({ verbose: true })) {
      if (m.color !== movableColor) continue;
      const list = map.get(m.from) ?? [];
      list.push({ to: m.to, promotion: m.promotion, capture: !!m.captured });
      map.set(m.from, list);
    }
    return map;
  }, [chess, interactive, movableColor]);

  const targets = useMemo(() => {
    const t = new Map<string, boolean>();
    if (selected) for (const m of legalBySquare.get(selected) ?? []) t.set(m.to, m.capture);
    return t;
  }, [selected, legalBySquare]);

  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null;
    const turn = chess.turn();
    for (const row of board) for (const p of row) if (p && p.type === "k" && p.color === turn) return p.square;
    return null;
  }, [chess, board]);

  const pieceAt = useCallback((sq: string) => chess.get(sq as never) ?? null, [chess]);

  const attempt = useCallback(
    (from: string, to: string, viaDrag: boolean) => {
      const moves = legalBySquare.get(from)?.filter((m) => m.to === to) ?? [];
      if (moves.length === 0) return false;
      if (moves.some((m) => m.promotion)) {
        setPromotion({ from, to });
        return true;
      }
      const id = pieceIds.get(from) ?? null;
      setInstantId(viaDrag ? id : null);
      const ok = onMove(from, to);
      if (ok) setSelected(null);
      return ok;
    },
    [legalBySquare, onMove, pieceIds],
  );

  const choosePromotion = (piece: PromotionPiece) => {
    if (!promotion) return;
    setInstantId(pieceIds.get(promotion.from) ?? null);
    onMove(promotion.from, promotion.to, piece);
    setPromotion(null);
    setSelected(null);
  };

  /** Shared click/tap/keyboard activation logic for a square. */
  const activate = useCallback(
    (sq: string) => {
      if (!interactive || promotion) return;
      if (selected && targets.has(sq)) {
        attempt(selected, sq, false);
        return;
      }
      const p = pieceAt(sq);
      if (p && p.color === movableColor && legalBySquare.has(sq)) {
        setSelected(sq === selected ? null : sq);
      } else setSelected(null);
    },
    [interactive, promotion, selected, targets, attempt, pieceAt, movableColor, legalBySquare],
  );

  const squareFromPoint = (clientX: number, clientY: number): string | null => {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return squareAt(col, row, orientation);
  };

  // ── Pointer (mouse, pen, touch) ─────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    setCursor(null);
    if (!interactive || promotion || e.button > 0) return;
    const sq = squareFromPoint(e.clientX, e.clientY);
    if (!sq) return;
    const p = pieceAt(sq);
    if (p && p.color === movableColor && legalBySquare.has(sq) && !(selected && targets.has(sq))) {
      const wasSelected = selected === sq;
      setSelected(sq);
      drag.current = { from: sq, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false, wasSelected };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } else {
      activate(sq);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5) {
      d.active = true;
      setDragging(d.from);
    }
    if (d.active) {
      const rect = boardRef.current!.getBoundingClientRect();
      const size = rect.width / 8;
      dragX.set(e.clientX - rect.left - size / 2);
      dragY.set(e.clientY - rect.top - size / 2);
      setHover(squareFromPoint(e.clientX, e.clientY));
    }
  };

  const endDrag = (e: React.PointerEvent, cancelled = false) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    setDragging(null);
    setHover(null);
    if (cancelled) return;
    if (d.active) {
      const to = squareFromPoint(e.clientX, e.clientY);
      if (to && to !== d.from) attempt(d.from, to, true);
    } else if (d.wasSelected) {
      setSelected(null);
    }
  };

  // ── Keyboard ────────────────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (promotion) {
      if (e.key === "Escape") setPromotion(null);
      return;
    }
    const cur = cursor ?? (orientation === "w" ? "e2" : "e7");
    const { col, row } = coordsOf(cur, orientation);
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dc, dr] = moves[e.key];
      setCursor(squareAt(Math.min(7, Math.max(0, col + dc)), Math.min(7, Math.max(0, row + dr)), orientation));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setCursor(cur);
      activate(cur);
    } else if (e.key === "Escape") {
      setSelected(null);
    }
  };

  const pieceTransition = motionPref === "full" ? MOVE_TWEEN : { duration: 0 };

  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = squareAt(col, row, orientation);
      const fileIdx = FILES.indexOf(sq[0]);
      const rank = Number(sq[1]);
      const dark = (fileIdx + rank) % 2 === 1;
      const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
      const isSel = selected === sq;
      const target = targets.has(sq);
      const capture = targets.get(sq);
      squares.push(
        <div
          key={sq}
          className="relative"
          style={{ background: dark ? "var(--sq-dark)" : "var(--sq-light)" }}
          aria-hidden
        >
          {isLast && <div className="absolute inset-0" style={{ background: "rgb(214 190 100 / 0.34)" }} />}
          {isSel && <div className="absolute inset-0" style={{ background: "rgb(120 170 130 / 0.5)" }} />}
          {checkSquare === sq && (
            <div className="absolute inset-0" style={{ background: "radial-gradient(circle, rgb(226 80 70 / 0.9) 0%, rgb(226 80 70 / 0.45) 38%, transparent 72%)" }} />
          )}
          {dragging && hover === sq && target && <div className="absolute inset-0 bg-white/20" />}
          {target && showLegalMoves && (
            <div className="absolute inset-0 grid place-items-center">
              {capture ? (
                <div className="size-full rounded-full border-[5px] border-black/15 sm:border-[6px]" />
              ) : (
                <div className="size-[26%] rounded-full bg-black/[0.17]" />
              )}
            </div>
          )}
          {cursor === sq && <div className="pointer-events-none absolute inset-[2px] ring-2 ring-accent" />}
          {showCoordinates && col === 0 && (
            <motion.span
              style={{ opacity: coordOpacity, color: dark ? "var(--sq-dark-ink)" : "var(--sq-light-ink)" }}
              className="absolute left-[4%] top-[3%] text-[9px] sm:text-[11px] font-semibold leading-none select-none"
            >
              {rank}
            </motion.span>
          )}
          {showCoordinates && row === 7 && (
            <motion.span
              style={{ opacity: coordOpacity, color: dark ? "var(--sq-dark-ink)" : "var(--sq-light-ink)" }}
              className="absolute right-[5%] bottom-[2%] text-[9px] sm:text-[11px] font-semibold leading-none select-none"
            >
              {sq[0]}
            </motion.span>
          )}
        </div>,
      );
    }
  }

  const pieces = [];
  for (const rowArr of board) {
    for (const p of rowArr) {
      if (!p) continue;
      const id = pieceIds.get(p.square) ?? p.square;
      const { col, row } = coordsOf(p.square, orientation);
      const hidden = dragging === p.square;
      pieces.push(
        <motion.div
          key={id}
          className="absolute left-0 top-0 h-[12.5%] w-[12.5%] will-change-transform"
          initial={false}
          animate={{ x: `${col * 100}%`, y: `${row * 100}%`, opacity: hidden ? 0.25 : 1 }}
          exit={{ opacity: 0, transition: { duration: motionPref === "full" ? 0.12 : 0 } }}
          transition={id === instantId ? { duration: 0 } : pieceTransition}
        >
          <motion.img
            src={`/pieces/${p.color}${p.type}.svg`}
            alt=""
            draggable={false}
            className="piece-img h-full w-full"
            style={{ rotate: counter }}
          />
        </motion.div>,
      );
    }
  }

  const dragPiece = dragging ? pieceAt(dragging) : null;

  return (
    <motion.div
      // Reduced motion: a soft cross-fade replaces the rotation on flips.
      key={motionPref === "reduced" ? orientation : "board"}
      initial={motionPref === "reduced" ? { opacity: 0.2 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative aspect-square w-full"
    >
      <motion.div
        ref={boardRef}
        role="application"
        aria-label={label}
        aria-roledescription="chess board"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          // Only show the keyboard cursor for keyboard focus, not mouse/touch.
          if (!cursor && e.currentTarget.matches(":focus-visible")) setCursor(orientation === "w" ? "e2" : "e7");
        }}
        onBlur={() => setCursor(null)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e)}
        onPointerCancel={(e) => endDrag(e, true)}
        onContextMenu={(e) => e.preventDefault()}
        style={{ rotate: rotation, scale, touchAction: "none" }}
        className={`board-shadow relative h-full w-full select-none overflow-hidden rounded-[6px] sm:rounded-[8px] outline-none focus-visible:outline-none ${
          interactive ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="grid h-full w-full grid-cols-8 grid-rows-8">{squares}</div>
        {/* Keyed by orientation: on a flip, pieces jump to their new layout (hidden by the rotation). */}
        <div key={orientation} className="pointer-events-none absolute inset-0">
          <AnimatePresence initial={false}>{pieces}</AnimatePresence>
        </div>
        {dragPiece && (
          <motion.div
            className="pointer-events-none absolute left-0 top-0 z-20 h-[12.5%] w-[12.5%]"
            style={{ x: dragX, y: dragY }}
          >
            <img src={`/pieces/${dragPiece.color}${dragPiece.type}.svg`} alt="" className="piece-img h-full w-full" style={{ filter: "drop-shadow(0 6px 6px rgb(0 0 0 / 0.3))" }} />
          </motion.div>
        )}
      </motion.div>

      <AnimatePresence>
        {promotion && (
          <PromotionPicker
            key="promo"
            color={movableColor}
            col={coordsOf(promotion.to, orientation).col}
            onPick={choosePromotion}
            onCancel={() => setPromotion(null)}
          />
        )}
      </AnimatePresence>

      <p className="sr-only" aria-live="polite">
        {selected ? `Selected ${PIECE_NAMES[pieceAt(selected)?.type ?? "p"]} on ${selected}` : cursor ? describeSquare(cursor, pieceAt(cursor)) : ""}
      </p>
    </motion.div>
  );
}

function describeSquare(sq: string, p: { color: string; type: string } | null) {
  return p ? `${sq}, ${p.color === "w" ? "white" : "black"} ${PIECE_NAMES[p.type]}` : `${sq}, empty`;
}

function PromotionPicker({
  color,
  col,
  onPick,
  onCancel,
}: {
  color: Color;
  col: number;
  onPick: (p: PromotionPiece) => void;
  onCancel: () => void;
}) {
  const pieces: PromotionPiece[] = ["q", "n", "r", "b"];
  const firstRef = useRef<HTMLButtonElement>(null);
  // The tap that opened the picker can produce a delayed compatibility click on
  // whichever button now sits under the finger. Ignore activations for a beat.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    firstRef.current?.focus();
    const t = setTimeout(() => setArmed(true), 350);
    return () => clearTimeout(t);
  }, []);
  const pick = (p: PromotionPiece) => armed && onPick(p);
  return (
    <motion.div
      className="absolute inset-0 z-30 rounded-[8px] bg-black/40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={(e) => {
        if (armed && e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <motion.div
        role="dialog"
        aria-label="Choose promotion piece"
        className="absolute top-0 flex flex-col overflow-hidden rounded-b-[6px] border border-t-0 border-line bg-raised shadow-lg shadow-black/50"
        style={{ left: `${Math.min(col, 7) * 12.5}%`, width: "12.5%" }}
        initial={{ y: -6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.14, ease: [0.2, 0.7, 0.3, 1] }}
      >
        {pieces.map((p, i) => (
          <button
            key={p}
            ref={i === 0 ? firstRef : undefined}
            onClick={() => pick(p)}
            aria-label={`Promote to ${PIECE_NAMES[p]}`}
            className="aspect-square w-full p-[8%] transition-colors duration-100 hover:bg-hover focus-visible:bg-hover"
          >
            <img src={`/pieces/${color}${p}.svg`} alt="" className="piece-img h-full w-full" />
          </button>
        ))}
        <button onClick={onCancel} aria-label="Cancel promotion" className="py-1.5 text-[11px] text-muted hover:text-text">
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}
