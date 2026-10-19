"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "./Board";
import { FlipLabel, FlipOverlay } from "./FlipOverlay";
import { FlipMeter, PlayerLine } from "./GameBits";
import { MoveList, MoveStrip } from "./MoveList";
import { ResultsModal } from "./ResultsModal";
import { SetupDialog } from "./SetupDialog";
import { Dialog } from "./Dialog";
import { useApp } from "./AppProvider";
import { getController, useGame } from "@/lib/client/game-store";
import { usePrefs, useHydrated } from "@/lib/client/prefs";
import { pieceIdentities, replay } from "@/lib/chess/rules";
import { controllerOf, playerColorAtPly } from "@/lib/flip/ownership";
import { createGame } from "@/lib/game/create";
import { toPgn } from "@/lib/game/pgn";
import { copyText } from "@/lib/game/share";
import { DIFFICULTY_LABEL, colorName, opposite, type GameSettings, type PromotionPiece } from "@/lib/types";

export function GameView() {
  const hydrated = useHydrated();
  const snap = useGame();
  const prefs = usePrefs();
  const { motion: motionPref } = useApp();
  const controller = hydrated ? getController() : null;
  const record = snap.record;

  const [setupState, setSetupOpen] = useState<boolean | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [resultShownFor, setResultShownFor] = useState<string | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [finalBanner, setFinalBanner] = useState(false);
  const [pgnCopied, setPgnCopied] = useState(false);

  // Setup opens automatically when there's no game, until the user decides otherwise.
  const setupOpen = setupState ?? (hydrated && !record);

  // Reset per-game UI state when a new session starts.
  const sessionId = record?.sessionId;
  const [prevSession, setPrevSession] = useState(sessionId);
  if (prevSession !== sessionId) {
    setPrevSession(sessionId);
    setViewPly(null);
    setFinalBanner(false);
    setConfirmResign(false);
  }

  // Show the result shortly after the game ends, once the final move has landed.
  useEffect(() => {
    if (!record?.result || resultShownFor === record.sessionId) return;
    const t = setTimeout(() => {
      setResultShownFor(record.sessionId);
      setResultOpen(true);
    }, 700);
    return () => clearTimeout(t);
  }, [record?.result, record?.sessionId, resultShownFor]);

  // "Final side" note once the last flip has finished.
  const prevFlip = useRef(snap.flip);
  useEffect(() => {
    const was = prevFlip.current;
    prevFlip.current = snap.flip;
    if (was?.final && !snap.flip) {
      setFinalBanner(true);
      const t = setTimeout(() => setFinalBanner(false), 1800);
      return () => clearTimeout(t);
    }
  }, [snap.flip]);

  useEffect(() => {
    if (!confirmResign) return;
    const t = setTimeout(() => setConfirmResign(false), 3000);
    return () => clearTimeout(t);
  }, [confirmResign]);

  const moves = useMemo(() => record?.moves ?? [], [record]);
  const totalPlies = moves.length;
  const shownPly = viewPly ?? totalPlies;
  const reviewing = viewPly !== null && viewPly !== totalPlies;

  const display = useMemo(() => {
    if (!record || !reviewing) return { fen: snap.fen, lastMove: snap.lastMove };
    const c = replay(record.moves, shownPly, record.startFen);
    const lm = shownPly > 0 ? record.moves[shownPly - 1] : null;
    return { fen: c.fen(), lastMove: lm ? { from: lm.from, to: lm.to } : null };
  }, [record, reviewing, shownPly, snap.fen, snap.lastMove]);

  const startFen = record?.startFen;
  const pieceIds = useMemo(() => pieceIdentities(moves, shownPly, startFen), [moves, shownPly, startFen]);
  const playerColor = record ? (reviewing ? playerColorAtPly(record.startColor, record.flips, shownPly) : record.playerColor) : "w";
  const aiColor = opposite(playerColor);
  const interactive = !!record && !reviewing && snap.phase === "player";
  const flipping = snap.phase === "flipping";
  const over = snap.phase === "over";

  const onMove = useCallback(
    (from: string, to: string, promotion?: PromotionPiece) => controller?.playerMove(from, to, promotion) ?? false,
    [controller],
  );

  const startGame = (settings: GameSettings) => {
    setSetupOpen(false);
    setResultOpen(false);
    controller?.load(createGame({ settings }));
  };

  const requestNewGame = () => {
    if (record && !record.result) setConfirmNew(true);
    else setSetupOpen(true);
  };

  const resign = () => {
    if (confirmResign) {
      controller?.resign();
      setConfirmResign(false);
    } else setConfirmResign(true);
  };

  const step = useCallback(
    (to: number) => {
      const clamped = Math.max(0, Math.min(totalPlies, to));
      setViewPly(clamped === totalPlies ? null : clamped);
    },
    [totalPlies],
  );

  // ← / → step through the game when the board doesn't have focus.
  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('[role="application"], [role="dialog"], [role="radiogroup"], input, textarea')) return;
      if (e.key === "ArrowLeft") step(shownPly - 1);
      else if (e.key === "ArrowRight") step(shownPly + 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [record, shownPly, step]);

  const exportPgn = async () => {
    if (!record) return;
    const pgn = toPgn(record);
    const ok = await copyText(pgn);
    try {
      const url = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `flip-chess-${record.sessionId.slice(0, 8)}.pgn`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Copying is enough.
    }
    setPgnCopied(ok);
    setTimeout(() => setPgnCopied(false), 2000);
  };

  // ── Status ─────────────────────────────────────────────────────────
  const toMove = record ? controllerOf(snap.turn, record.playerColor) : null;
  const live = !!record && !reviewing && !over;
  const aiToMove = live && !flipping && toMove === "ai";
  const youToMove = live && !flipping && toMove === "player";

  let youStatus: React.ReactNode = null;
  if (record) {
    if (reviewing) {
      youStatus = (
        <button onClick={() => step(totalPlies)} className="text-muted hover:text-text">
          {record.result ? "Back to end" : "Back to game"}
        </button>
      );
    } else if (over && record.result) {
      const o = record.result.outcome;
      youStatus = <span className={o === "win" ? "text-accent" : "text-muted"}>{o === "win" ? "You won" : o === "loss" ? "You lost" : "Draw"}</span>;
    } else if (youToMove) {
      youStatus = snap.inCheck ? <span className="text-danger">Check</span> : <span className="text-text">Your move</span>;
    }
  }
  const aiStatus = aiToMove ? <span className="text-faint">{snap.inCheck ? "In check · thinking" : "Thinking…"}</span> : null;

  const flipsUsed = record?.flips.length ?? 0;
  const flipsTotal = record?.schedule.length ?? prefs.setup.flips;
  const dailyInProgress = record?.mode === "daily" && !record.result;

  const steppers = record && (
    <div className="flex items-center">
      <button onClick={() => step(0)} disabled={shownPly === 0} aria-label="First move" className="btn btn-ghost btn-icon h-8 w-8">
        <ChevronsLeft size={16} />
      </button>
      <button onClick={() => step(shownPly - 1)} disabled={shownPly === 0} aria-label="Previous move" className="btn btn-ghost btn-icon h-8 w-8">
        <ChevronLeft size={16} />
      </button>
      <button onClick={() => step(shownPly + 1)} disabled={shownPly >= totalPlies} aria-label="Next move" className="btn btn-ghost btn-icon h-8 w-8">
        <ChevronRight size={16} />
      </button>
      <button onClick={() => step(totalPlies)} disabled={shownPly >= totalPlies} aria-label="Latest move" className="btn btn-ghost btn-icon h-8 w-8">
        <ChevronsRight size={16} />
      </button>
    </div>
  );

  const actions = (
    <>
      <button onClick={requestNewGame} className="btn btn-secondary h-8 px-3">
        New game
      </button>
      {record && !record.result && (
        <button onClick={resign} className={`btn h-8 px-3 ${confirmResign ? "bg-danger/15 text-danger" : "btn-ghost"}`}>
          {confirmResign ? "Confirm resign" : "Resign"}
        </button>
      )}
      {record?.result && (
        <button onClick={exportPgn} className="btn btn-ghost h-8 px-3">
          {pgnCopied ? "PGN copied" : "PGN"}
        </button>
      )}
    </>
  );

  return (
    <div className="flex-1">
      <FlipOverlay flip={snap.flip} />
      <div className="mx-auto w-full max-w-5xl px-3 pb-8 pt-1 sm:px-6 sm:pt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_232px] lg:gap-12 lg:pt-6">
        {/* Board column */}
        <section className="mx-auto w-full" style={{ maxWidth: "min(100%, max(320px, calc(100dvh - 10.5rem)), 680px)" }} aria-label="Game">
          <PlayerLine
            name="Stockfish"
            detail={record ? DIFFICULTY_LABEL[record.settings.difficulty] : undefined}
            color={aiColor}
            toMove={aiToMove}
            status={aiStatus}
          />

          <div className={`relative ${flipping ? "z-50" : ""}`}>
            {hydrated ? (
              <Board
                fen={display.fen}
                orientation={playerColor}
                interactive={interactive}
                movableColor={playerColor}
                lastMove={display.lastMove}
                pieceIds={pieceIds}
                onMove={onMove}
                motion={motionPref}
                showCoordinates={prefs.showCoordinates}
                showLegalMoves={prefs.showLegalMoves}
                label={`Chess board. You play ${colorName(playerColor)}.`}
              />
            ) : (
              <div className="aspect-square w-full rounded-[8px] bg-raised" />
            )}
            <FlipLabel flip={snap.flip} motion={motionPref} />
            <AnimatePresence>
              {finalBanner && (
                <motion.div
                  className="pointer-events-none absolute inset-0 z-40 grid place-items-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  role="status"
                >
                  <div className="rounded-md bg-bg/90 px-3.5 py-2 text-[13px] shadow-lg shadow-black/40">
                    <span className="font-semibold text-flip">Final side.</span> <span>No more flips.</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {!record && hydrated && !setupOpen && (
              <div className="absolute inset-0 grid place-items-center rounded-[8px] bg-bg/50">
                <button onClick={() => setSetupOpen(true)} className="btn btn-primary">
                  New game
                </button>
              </div>
            )}
          </div>

          <PlayerLine name="You" color={playerColor} toMove={youToMove} status={youStatus} />

          {/* Small screens: the essentials, directly under the board */}
          <div className="lg:hidden">
            <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
              {record ? <FlipMeter used={flipsUsed} total={flipsTotal} /> : <span />}
              <div className="flex items-center gap-1">{actions}</div>
            </div>
            {record && (
              <div className="mt-1 flex items-center gap-1">
                <MoveStrip moves={moves} flips={record.flips} startFen={startFen} viewPly={shownPly} onSelect={step} className="min-w-0 flex-1" />
                {steppers}
              </div>
            )}
            {record?.mode === "daily" && <p className="mt-2 text-[12px] text-faint">Daily #{record.dailyNumber}</p>}
          </div>
          {snap.engineError && <p className="mt-2 text-[12px] text-faint">The engine couldn&apos;t load, so the AI is playing simplified moves.</p>}
        </section>

        {/* Large screens: a quiet column beside the board */}
        <aside className="hidden lg:flex lg:flex-col lg:pt-10" style={{ maxHeight: "min(calc(100dvh - 6rem), 760px)" }}>
          {record?.mode === "daily" && <p className="mb-2 text-[12px] text-faint">Daily #{record.dailyNumber}</p>}
          {record && <FlipMeter used={flipsUsed} total={flipsTotal} />}
          <div className="mt-4 min-h-0 flex-1 border-t border-line pt-3">
            {record && <MoveList moves={moves} flips={record.flips} startFen={startFen} viewPly={shownPly} onSelect={step} className="h-full max-h-[420px]" />}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-2">{steppers}</div>
          <div className="mt-3 flex flex-wrap items-center gap-1">{actions}</div>
          {record?.result && !resultOpen && (
            <button onClick={() => setResultOpen(true)} className="mt-3 self-start text-[13px] text-muted hover:text-text">
              Show result
            </button>
          )}
        </aside>
      </div>

      <SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} onStart={startGame} />

      <Dialog open={confirmNew} onClose={() => setConfirmNew(false)} title="Start a new game?">
        <div className="px-5 pb-5">
          <p className="text-[14px] text-muted">
            {dailyInProgress ? "This resigns your Daily. Today’s attempt will count as a loss." : "This resigns the current game."}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirmNew(false)} className="btn btn-ghost">
              Cancel
            </button>
            <button
              onClick={() => {
                controller?.resign();
                setConfirmNew(false);
                setResultShownFor(record?.sessionId ?? null);
                setSetupOpen(true);
              }}
              className="btn btn-primary"
            >
              Resign and start
            </button>
          </div>
        </div>
      </Dialog>

      {record?.result && (
        <ResultsModal
          record={record}
          open={resultOpen}
          onClose={() => setResultOpen(false)}
          onPlayAgain={() => {
            setResultOpen(false);
            setSetupOpen(true);
          }}
          playAgainLabel={record.mode === "daily" ? "New game" : "Play again"}
          onReview={() => {
            setResultOpen(false);
            setViewPly(0);
          }}
        />
      )}
    </div>
  );
}
