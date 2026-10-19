"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "./Dialog";
import { Board } from "./Board";
import { useApp } from "./AppProvider";
import { pieceIdentities } from "@/lib/chess/rules";
import { getController, useGame } from "@/lib/client/game-store";
import { useHydrated } from "@/lib/client/prefs";
import { dailyChallenge, msUntilNextDaily, type DailyChallenge } from "@/lib/daily/daily";
import { createGame } from "@/lib/game/create";
import { copyText, shareText } from "@/lib/game/share";
import { loadDaily, saveDailyEntry, type DailyEntry } from "@/lib/storage/storage";
import { DIFFICULTY_LABEL, colorName } from "@/lib/types";

function formatCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function DailyView() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="flex-1" />;
  return <DailyInner />;
}

function DailyInner() {
  const router = useRouter();
  const snap = useGame();
  const [now, setNow] = useState(() => new Date());
  const challenge: DailyChallenge = dailyChallenge(now);
  const { motion } = useApp();
  const previewIds = pieceIdentities([], 0, challenge.position.fen);
  // Read storage on every render (cheap) so a just-finished Daily shows up immediately.
  const entries: Record<string, DailyEntry> = loadDaily();
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const entry = entries[challenge.key];
  const active = snap.record;
  const activeIsToday = active?.mode === "daily" && active.dailyKey === challenge.key && !active.result;
  const otherGameInProgress = !!active && !active.result && !activeIsToday;

  const start = () => {
    const controller = getController();
    if (otherGameInProgress) controller.resign();
    const record = createGame({
      settings: challenge.settings,
      seed: challenge.seed,
      mode: "daily",
      dailyNumber: challenge.number,
      dailyKey: challenge.key,
      startFen: challenge.position.fen,
    });
    saveDailyEntry({ key: challenge.key, number: challenge.number, sessionId: record.sessionId, status: "started" });
    controller.load(record);
    router.push("/play");
  };


  const s = challenge.settings;
  const summary = entry?.status === "done" ? entry.summary : undefined;
  const share = summary ? shareText(summary, window.location.origin) : "";

  const outcomeLine = summary
    ? `${summary.outcome === "win" ? "Won" : summary.outcome === "draw" ? "Drew" : "Lost"} in ${summary.moves} moves, finishing as ${colorName(summary.finalColor)}.`
    : null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6 sm:py-14">
      <p className="label">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
      <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.02em]">Daily #{challenge.number}</h1>
      <p className="mt-1 text-[14px] text-muted">
        Start as {colorName(s.startChoice)} · {DIFFICULTY_LABEL[s.difficulty]} · {s.flips} flip{s.flips === 1 ? "" : "s"}
      </p>

      <div className="mt-6">
        <Board
          fen={challenge.position.fen}
          orientation={s.startChoice}
          interactive={false}
          movableColor={s.startChoice}
          lastMove={null}
          pieceIds={previewIds}
          onMove={() => false}
          motion={motion}
          showCoordinates={false}
          showLegalMoves={false}
          label={`Today's starting position: ${challenge.position.name}`}
        />
        <p className="mt-2 flex justify-between text-[13px]">
          <span>{challenge.position.name}</span>
          <span className="text-faint">{colorName(challenge.position.fen.split(" ")[1] as "w" | "b")} to move</span>
        </p>
      </div>

      <div className="mt-6">
        {summary ? (
          <>
            <p className={`text-[16px] font-medium ${summary.outcome === "win" ? "text-accent" : ""}`}>{outcomeLine}</p>
            <pre className="mt-4 whitespace-pre-wrap border-y border-line py-4 font-sans text-[13px] leading-relaxed text-muted">{share}</pre>
            <button
              onClick={async () => {
                setCopied(await copyText(share));
                setTimeout(() => setCopied(false), 2000);
              }}
              className="btn btn-primary mt-4 h-10 w-full text-[14px]"
            >
              {copied ? "Copied" : "Copy result"}
            </button>
          </>
        ) : activeIsToday ? (
          <button onClick={() => router.push("/play")} className="btn btn-primary h-10 w-full text-[14px]">
            Resume
          </button>
        ) : entry?.status === "started" ? (
          <p className="text-[14px] text-muted">You&apos;ve used today&apos;s attempt on this device.</p>
        ) : (
          <button onClick={() => (otherGameInProgress ? setConfirm(true) : start())} className="btn btn-primary h-10 w-full text-[14px]">
            Start
          </button>
        )}
      </div>

      <p className="mt-6 text-[13px] text-faint">
        One attempt per day. Next Daily in <span className="tabular-nums text-muted">{formatCountdown(msUntilNextDaily(now))}</span>.
      </p>
      <p className="mt-2 text-[12px] text-faint">Same position, color, difficulty and flip timing for everyone. Results are kept in this browser only.</p>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Game in progress">
        <div className="px-5 pb-5">
          <p className="text-[14px] text-muted">Starting the Daily resigns your current game.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirm(false)} className="btn btn-ghost">Cancel</button>
            <button onClick={start} className="btn btn-primary">Resign and start</button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
