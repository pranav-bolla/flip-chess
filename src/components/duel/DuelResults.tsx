"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "../Dialog";
import type { RoomSnapshot } from "@/lib/duel/rooms";
import { colorOfSeat } from "@/lib/duel/rules";
import { duelShareText } from "@/lib/duel/share";
import { END_REASON_LABEL } from "@/lib/chess/rules";
import { copyText } from "@/lib/game/share";
import { colorName } from "@/lib/types";

export function DuelResults({
  snap,
  open,
  onClose,
  onRematch,
  onReview,
}: {
  snap: RoomSnapshot;
  open: boolean;
  onClose: () => void;
  onRematch: () => void;
  onReview: () => void;
}) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const { game, you, players, rematchVotes } = snap;
  const r = game.result;
  if (!r) return null;
  const name = (s: 0 | 1) => players[s]?.name ?? (s === 0 ? "Player 1" : "Player 2");
  const winner = r.winnerSeat;

  let title: string;
  if (winner === null) title = "Draw.";
  else if (you === null) title = `${name(winner)} wins.`;
  else if (r.reason === "resignation") title = winner === you ? `${name(winner === 0 ? 1 : 0)} resigned. You win.` : "Resigned. You lose.";
  else title = winner === you ? "Checkmate. You win." : "Checkmate. You lose.";

  const rows: Array<[string, string]> = [
    ["Winner", winner === null ? "—" : name(winner)],
    ["Winning color", r.winningColor ? colorName(r.winningColor) : "—"],
    ["Moves", String(Math.max(1, Math.ceil(game.moves.length / 2)))],
    ["Flips", String(game.flips.length)],
    [`${name(0)} finished as`, colorName(colorOfSeat(game, 0))],
    [`${name(1)} finished as`, colorName(colorOfSeat(game, 1))],
    ["Ended by", END_REASON_LABEL[r.reason]],
  ];

  const text = duelShareText(snap, typeof window !== "undefined" ? window.location.origin : undefined);
  const iVoted = you !== null && rematchVotes.includes(you);
  const theyVoted = you !== null && rematchVotes.includes(you === 0 ? 1 : 0);

  return (
    <Dialog open={open} onClose={onClose} labelledBy="duel-result-title">
      <div className="px-5 pb-5 pt-6">
        <p className="label mb-1">Flip Duel</p>
        <h2 id="duel-result-title" className={`text-[20px] font-semibold tracking-tight ${winner !== null && winner === you ? "text-accent" : ""}`}>
          {title}
        </h2>
        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="truncate text-muted">{k}</dt>
              <dd className="shrink-0">{v}</dd>
            </div>
          ))}
        </dl>
        {you !== null && (
          <button onClick={onRematch} disabled={iVoted} className="btn btn-primary mt-6 h-10 w-full text-[14px]">
            {iVoted ? `Waiting for ${name(you === 0 ? 1 : 0)}…` : theyVoted ? `${name(you === 0 ? 1 : 0)} wants a rematch — accept` : "Rematch"}
          </button>
        )}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Link href="/duel" className="btn btn-secondary">New game</Link>
          <button
            onClick={async () => {
              const ok = await copyText(text);
              setCopied(ok ? "ok" : "fail");
              setTimeout(() => setCopied(null), 2000);
            }}
            className="btn btn-secondary"
          >
            {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "Share"}
          </button>
          <button onClick={onReview} className="btn btn-secondary">Review</button>
        </div>
        {copied === "fail" && (
          <textarea readOnly value={text} className="mt-3 h-36 w-full rounded-md border border-line bg-bg p-3 text-[12px] text-muted" onFocus={(e) => e.currentTarget.select()} />
        )}
      </div>
    </Dialog>
  );
}
