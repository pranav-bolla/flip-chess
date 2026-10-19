"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "../Board";
import { FlipLabel, FlipOverlay } from "../FlipOverlay";
import { PlayerLine } from "../GameBits";
import { MoveList, MoveStrip } from "../MoveList";
import { useApp } from "../AppProvider";
import { DuelCountdown } from "./DuelCountdown";
import { DuelResults } from "./DuelResults";
import { NamePrompt } from "./NamePrompt";
import { getSavedName, saveName, useDuelRoom } from "@/lib/client/duel-client";
import { usePrefs, useHydrated } from "@/lib/client/prefs";
import { pieceIdentities, replay, toMoveRecord, tryMove } from "@/lib/chess/rules";
import { colorOfSeat, colorOfSeatAtPly, countdown, seatOfColor, type DuelGame, type DuelMove, type Seat } from "@/lib/duel/rules";
import type { RoomSnapshot } from "@/lib/duel/rooms";
import type { FlipAnimation } from "@/lib/game/controller";
import { copyText } from "@/lib/game/share";
import { sounds } from "@/lib/audio/sound";
import type { Color, FlipEvent, MoveRecord, PromotionPiece } from "@/lib/types";

const FLIP_ANIM_MS = 1100;

export function DuelRoom({ code }: { code: string }) {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="flex-1" />;
  return <DuelRoomInner code={code} />;
}

function DuelRoomInner({ code }: { code: string }) {
  const [name, setName] = useState<string | null>(() => getSavedName() || null);
  const room = useDuelRoom(code, name);

  if (name === null) {
    return (
      <NamePrompt
        title="Join Flip Duel"
        cta="Join game"
        onSubmit={(n) => {
          saveName(n);
          setName(n);
        }}
      />
    );
  }
  if (room.status === "error" && !room.snapshot) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
        <h1 className="text-[20px] font-semibold">Can&apos;t join room {code}</h1>
        <p className="mt-2 text-[14px] text-muted">{room.error}</p>
        <Link href="/duel" className="btn btn-primary mt-6">
          Start a new duel
        </Link>
      </div>
    );
  }
  if (!room.snapshot) {
    return <p className="mx-auto mt-16 text-[13px] text-faint">{room.online ? "Joining…" : "Connecting…"}</p>;
  }
  return <DuelTable snap={room.snapshot} room={room} />;
}

type Room = ReturnType<typeof useDuelRoom>;

/** Apply the optimistic move (if any) so your own move lands instantly. */
function useDisplayMoves(game: DuelGame, pending: Room["pending"], you: Seat | null): DuelMove[] {
  return useMemo(() => {
    if (!pending || you === null || pending.gameId !== game.id || pending.ply !== game.moves.length) return game.moves;
    const chess = replay(game.moves);
    const m = tryMove(chess, pending.from, pending.to, pending.promotion);
    if (!m) return game.moves;
    const { by: _by, ...rec } = toMoveRecord(m, "player");
    void _by;
    return [...game.moves, { ...rec, seat: you }];
  }, [game, pending, you]);
}

function soundFor(m: Pick<MoveRecord, "san" | "flags">) {
  if (m.san.includes("+")) sounds.check();
  else if (m.flags.includes("k") || m.flags.includes("q")) sounds.castle();
  else if (m.flags.includes("c") || m.flags.includes("e")) sounds.capture();
  else sounds.move();
}

function DuelTable({ snap, room }: { snap: RoomSnapshot; room: Room }) {
  const prefs = usePrefs();
  const { motion: motionPref } = useApp();
  const { game, you, players } = snap;
  const opponentSeat: Seat = you === 1 ? 0 : 1;
  const mySeat: Seat = you ?? 0; // spectators watch from seat 0's side
  const displayMoves = useDisplayMoves(game, room.pending, you);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultShownFor, setResultShownFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);

  // ── Flip animation: only for flips that happen while you're watching ──
  const [flipAnim, setFlipAnim] = useState<FlipAnimation | null>(null);
  const [seen, setSeen] = useState({ gameId: game.id, flips: game.flips.length });
  if (seen.gameId !== game.id || seen.flips !== game.flips.length) {
    const isNewFlip = seen.gameId === game.id && game.flips.length > seen.flips;
    setSeen({ gameId: game.id, flips: game.flips.length });
    if (seen.gameId !== game.id) setViewPly(null);
    if (isNewFlip && you !== null) {
      const final = game.config.maxFlips !== null && game.flips.length >= game.config.maxFlips;
      setFlipAnim({ id: game.flips.length, toColor: colorOfSeat(game, mySeat), final });
    }
  }
  // The server refuses moves until its post-flip lock lifts; mirror that locally.
  const [unlockedAt, setUnlockedAt] = useState(0);
  const { clockOffset } = room;
  useEffect(() => {
    if (!game.flipLockUntil) return;
    const t = setTimeout(() => setUnlockedAt(game.flipLockUntil), Math.max(0, game.flipLockUntil - (Date.now() + clockOffset)));
    return () => clearTimeout(t);
  }, [game.flipLockUntil, clockOffset]);
  const locked = game.flipLockUntil > 0 && unlockedAt !== game.flipLockUntil;

  useEffect(() => {
    if (!flipAnim) return;
    const t = setTimeout(() => setFlipAnim(null), FLIP_ANIM_MS);
    return () => clearTimeout(t);
  }, [flipAnim]);

  // ── Sounds for moves that arrive from the server ──
  const sounded = useRef<{ gameId: string; ply: number; ended: boolean } | null>(null);
  useEffect(() => {
    const prev = sounded.current;
    sounded.current = { gameId: game.id, ply: Math.max(game.moves.length, prev?.gameId === game.id ? prev.ply : 0), ended: !!game.result };
    if (!prev || prev.gameId !== game.id) return; // first sync or a new game: stay quiet
    const decisive = game.result && (game.result.reason === "checkmate" || game.result.reason === "resignation");
    if (decisive && !prev.ended) sounds.mate();
    else if (game.moves.length > prev.ply) soundFor(game.moves[game.moves.length - 1]);
  }, [game.id, game.moves, game.result]);

  // ── Results modal ──
  useEffect(() => {
    if (!game.result || resultShownFor === game.id) return;
    const t = setTimeout(() => {
      setResultShownFor(game.id);
      setResultOpen(true);
    }, 700);
    return () => clearTimeout(t);
  }, [game.result, game.id, resultShownFor]);

  useEffect(() => {
    if (!confirmResign) return;
    const t = setTimeout(() => setConfirmResign(false), 3000);
    return () => clearTimeout(t);
  }, [confirmResign]);

  const total = displayMoves.length;
  const shownPly = viewPly ?? total;
  const reviewing = viewPly !== null && viewPly !== total;

  const position = useMemo(() => replay(displayMoves, shownPly), [displayMoves, shownPly]);
  const fen = position.fen();
  const turn = position.turn() as Color;
  const lastMove = shownPly > 0 ? displayMoves[shownPly - 1] : null;
  const pieceIds = useMemo(() => pieceIdentities(displayMoves as unknown as MoveRecord[], shownPly), [displayMoves, shownPly]);

  const myColor = reviewing ? colorOfSeatAtPly(game, mySeat, shownPly) : colorOfSeat(game, mySeat);
  const opponentColor: Color = myColor === "w" ? "b" : "w";
  const bothHere = !!players[0] && !!players[1];
  const live = !game.result && !reviewing;
  const myTurn = live && you !== null && seatOfColor(game, turn) === you;
  const theirTurn = live && bothHere && !myTurn;
  const interactive = myTurn && bothHere && !flipAnim && !room.pending && room.online && !locked;

  const onMove = useCallback(
    (from: string, to: string, promotion?: PromotionPiece) => {
      // Play our own sound immediately; the server echo is then skipped.
      const probe = replay(game.moves);
      const m = tryMove(probe, from, to, promotion);
      if (!m) return false;
      sounded.current = { gameId: game.id, ply: game.moves.length + 1, ended: false };
      if (!probe.isCheckmate()) soundFor(m);
      room.move(from, to, promotion);
      return true;
    },
    [game.id, game.moves, room],
  );

  const step = useCallback((to: number) => {
    const c = Math.max(0, Math.min(total, to));
    setViewPly(c === total ? null : c);
  }, [total]);

  // ← / → step through moves when the board isn't focused.
  useEffect(() => {
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
  }, [shownPly, step]);

  const c = countdown(game);
  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/duel/${snap.code}` : "";
  const copyInvite = async () => {
    setCopied(await copyText(inviteUrl));
    setTimeout(() => setCopied(false), 2000);
  };

  // Move list from your point of view: your moves bright, flips say what you became.
  const listMoves: MoveRecord[] = displayMoves.map((m) => ({ ...m, by: m.seat === mySeat ? "player" : "ai" }));
  const listFlips: FlipEvent[] = game.flips.map((f) => ({ ply: f.ply, playerColor: f.whiteSeat === mySeat ? "w" : "b" }));

  const opp = players[opponentSeat];
  const me = you !== null ? players[you] : null;
  const oppStatus = !opp ? (
    <span className="text-faint">Not here yet</span>
  ) : !opp.connected ? (
    <span className="text-danger">Disconnected</span>
  ) : theirTurn && !flipAnim ? (
    <span className="text-faint">Their move</span>
  ) : null;
  let myStatus: React.ReactNode = null;
  if (reviewing) {
    myStatus = (
      <button onClick={() => step(total)} className="text-muted hover:text-text">
        {game.result ? "Back to end" : "Back to game"}
      </button>
    );
  } else if (game.result) {
    const w = game.result.winnerSeat;
    myStatus = w === null ? <span className="text-muted">Draw</span> : w === mySeat ? <span className="text-accent">{you === null ? `${players[w]?.name} won` : "You won"}</span> : <span className="text-muted">{you === null ? `${players[w]?.name} won` : "You lost"}</span>;
  } else if (myTurn && bothHere && !flipAnim) {
    myStatus = position.inCheck() ? <span className="text-danger">Check</span> : <span>Your move</span>;
  }

  const steppers = (
    <div className="flex items-center">
      <button onClick={() => step(0)} disabled={shownPly === 0} aria-label="First move" className="btn btn-ghost btn-icon h-8 w-8"><ChevronsLeft size={16} /></button>
      <button onClick={() => step(shownPly - 1)} disabled={shownPly === 0} aria-label="Previous move" className="btn btn-ghost btn-icon h-8 w-8"><ChevronLeft size={16} /></button>
      <button onClick={() => step(shownPly + 1)} disabled={shownPly >= total} aria-label="Next move" className="btn btn-ghost btn-icon h-8 w-8"><ChevronRight size={16} /></button>
      <button onClick={() => step(total)} disabled={shownPly >= total} aria-label="Latest move" className="btn btn-ghost btn-icon h-8 w-8"><ChevronsRight size={16} /></button>
    </div>
  );

  const iVoted = you !== null && snap.rematchVotes.includes(you);
  const theyVoted = snap.rematchVotes.includes(opponentSeat);
  const actions =
    you === null ? (
      <span className="text-[13px] text-faint">Watching</span>
    ) : game.result ? (
      <>
        <button onClick={room.rematch} disabled={iVoted} className={`btn h-8 px-3 ${theyVoted && !iVoted ? "btn-primary" : "btn-secondary"}`}>
          {iVoted ? "Rematch requested" : theyVoted ? "Accept rematch" : "Rematch"}
        </button>
        <Link href="/duel" className="btn btn-ghost h-8 px-3">New game</Link>
      </>
    ) : (
      <>
        <button
          onClick={() => (confirmResign ? (room.resign(), setConfirmResign(false)) : setConfirmResign(true))}
          disabled={!bothHere}
          className={`btn h-8 px-3 ${confirmResign ? "bg-danger/15 text-danger" : "btn-ghost"}`}
        >
          {confirmResign ? "Confirm resign" : "Resign"}
        </button>
        <button onClick={copyInvite} className="btn btn-ghost h-8 px-3">{copied ? "Link copied" : "Invite link"}</button>
      </>
    );

  return (
    <div className="flex-1">
      <FlipOverlay flip={flipAnim} />
      <div className="mx-auto w-full max-w-5xl px-3 pb-8 pt-1 sm:px-6 sm:pt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_232px] lg:gap-12 lg:pt-4">
        <section className="mx-auto w-full" style={{ maxWidth: "min(100%, max(320px, calc(100dvh - 14rem)), 660px)" }} aria-label="Flip Duel">
          <DuelCountdown c={c} flipEvery={game.config.flipEvery} flipping={!!flipAnim} over={!!game.result} flips={game.flips.length} />
          <PlayerLine name={opp?.name ?? "Opponent"} color={opponentColor} toMove={theirTurn} status={oppStatus} />

          <div className={`relative ${flipAnim ? "z-50" : ""}`}>
            <Board
              fen={fen}
              orientation={myColor}
              interactive={interactive}
              movableColor={myColor}
              lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
              pieceIds={pieceIds}
              onMove={onMove}
              motion={motionPref}
              showCoordinates={prefs.showCoordinates}
              showLegalMoves={prefs.showLegalMoves}
              label={`Chess board. You play ${myColor === "w" ? "White" : "Black"}.`}
            />
            <FlipLabel flip={flipAnim} motion={motionPref} />
            {!bothHere && you !== null && <InviteOverlay url={inviteUrl} code={snap.code} copied={copied} onCopy={copyInvite} />}
          </div>

          <PlayerLine name="You" detail={me?.name} color={myColor} toMove={myTurn && bothHere} status={myStatus} />

          <AnimatePresence>
            {(room.error || !room.online) && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-1 text-[12px] text-faint" role="status">
                {!room.online ? "Connection lost. Reconnecting…" : room.error}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="lg:hidden">
            <div className="flex items-center justify-end gap-1 border-t border-line pt-2">{actions}</div>
            <div className="mt-1 flex items-center gap-1">
              <MoveStrip moves={listMoves} flips={listFlips} viewPly={shownPly} onSelect={step} className="min-w-0 flex-1" />
              {steppers}
            </div>
          </div>
        </section>

        <aside className="hidden lg:flex lg:flex-col lg:pt-[92px]" style={{ maxHeight: "min(calc(100dvh - 6rem), 780px)" }}>
          <p className="text-[12px] text-faint">Room {snap.code}</p>
          <div className="mt-3 min-h-0 flex-1 border-t border-line pt-3">
            <MoveList moves={listMoves} flips={listFlips} viewPly={shownPly} onSelect={step} className="h-full max-h-[420px]" />
          </div>
          <div className="mt-3 flex items-center border-t border-line pt-2">{steppers}</div>
          <div className="mt-3 flex flex-wrap items-center gap-1">{actions}</div>
          {game.result && !resultOpen && (
            <button onClick={() => setResultOpen(true)} className="mt-3 self-start text-[13px] text-muted hover:text-text">Show result</button>
          )}
        </aside>
      </div>

      {game.result && (
        <DuelResults
          snap={snap}
          open={resultOpen}
          onClose={() => setResultOpen(false)}
          onRematch={room.rematch}
          onReview={() => {
            setResultOpen(false);
            setViewPly(0);
          }}
        />
      )}
    </div>
  );
}

function InviteOverlay({ url, code, copied, onCopy }: { url: string; code: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center rounded-[8px] bg-bg/75 p-4">
      <div className="w-full max-w-[320px] text-center">
        <p className="text-[16px] font-medium">Waiting for a friend</p>
        <p className="mt-1 text-[13px] text-muted">Send them this link. You&apos;ll play White first.</p>
        <div className="mt-4 flex items-center gap-2 rounded-md border border-line bg-bg px-3 py-2 text-left">
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{url}</span>
        </div>
        <button onClick={onCopy} className="btn btn-primary mt-3 w-full">{copied ? "Copied" : "Copy invite link"}</button>
        <p className="mt-3 text-[12px] text-faint">
          Room code <span className="font-medium tracking-[0.12em] text-muted">{code}</span>
        </p>
      </div>
    </div>
  );
}
