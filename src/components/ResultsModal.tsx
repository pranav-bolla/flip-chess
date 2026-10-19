"use client";

import { useState } from "react";
import { Dialog } from "./Dialog";
import type { GameRecord } from "@/lib/types";
import { colorName } from "@/lib/types";
import { END_REASON_LABEL } from "@/lib/chess/rules";
import { fullMoves, summarize } from "@/lib/game/summary";
import { copyText, shareText } from "@/lib/game/share";

export function resultTitle(record: GameRecord): string {
  const r = record.result!;
  if (r.outcome === "draw") return "Draw.";
  if (r.reason === "resignation") return "Resigned. You lose.";
  return r.outcome === "win" ? "Checkmate. You win." : "Checkmate. You lose.";
}

export function ResultsModal({
  record,
  open,
  onClose,
  onPlayAgain,
  onReview,
  playAgainLabel = "Play again",
}: {
  record: GameRecord;
  open: boolean;
  onClose: () => void;
  onPlayAgain: () => void;
  onReview: () => void;
  playAgainLabel?: string;
}) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const r = record.result;
  if (!r) return null;
  const summary = summarize(record)!;
  const text = shareText(summary, typeof window !== "undefined" ? window.location.origin : undefined);

  const share = async () => {
    const ok = await copyText(text);
    setCopied(ok ? "ok" : "fail");
    setTimeout(() => setCopied(null), 2000);
  };

  const rows: Array<[string, string]> = [
    ["Winner", r.winningColor ? colorName(r.winningColor) : "—"],
    ["Started as", colorName(record.startColor)],
    ["Finished as", colorName(record.playerColor)],
    ["Flips", `${record.flips.length} of ${record.schedule.length}`],
    ["Moves", String(fullMoves(record.moves.length))],
    ["Ended by", END_REASON_LABEL[r.reason]],
  ];

  return (
    <Dialog open={open} onClose={onClose} labelledBy="result-title">
      <div className="px-5 pb-5 pt-6">
        {record.mode === "daily" && <p className="label mb-1">Daily #{record.dailyNumber}</p>}
        <h2 id="result-title" className={`text-[20px] font-semibold tracking-tight ${r.outcome === "win" ? "text-accent" : ""}`}>
          {resultTitle(record)}
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line pt-4 text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex gap-2">
          <button onClick={onPlayAgain} className="btn btn-primary flex-1">
            {playAgainLabel}
          </button>
          <button onClick={share} className="btn btn-secondary">
            {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "Share"}
          </button>
          <button onClick={onReview} className="btn btn-secondary">
            Review
          </button>
        </div>
        {copied === "fail" && (
          <textarea
            readOnly
            value={text}
            className="mt-3 h-36 w-full rounded-md border border-line bg-bg p-3 text-[12px] text-muted"
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
      </div>
    </Dialog>
  );
}
