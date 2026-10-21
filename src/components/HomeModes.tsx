"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { useHydrated } from "@/lib/client/prefs";
import { dailyChallenge } from "@/lib/daily/daily";
import { loadDaily } from "@/lib/storage/storage";

function Row({ href, glyph, title, meta, description, highlight }: { href: string; glyph: ReactNode; title: ReactNode; meta?: ReactNode; description: string; highlight?: boolean }) {
  return (
    <li>
      <Link
        href={href}
        className={`group -mx-3 flex items-center gap-4 rounded-md px-3 py-3.5 transition-colors duration-100 hover:bg-hover ${highlight ? "bg-white/[0.03]" : ""}`}
      >
        <span className="grid size-9 shrink-0 place-items-center">{glyph}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="text-[16px] font-medium">{title}</span>
            {meta}
          </div>
          <div className="text-[14px] text-muted">{description}</div>
        </div>
        <ArrowRight size={16} className="shrink-0 text-faint transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-text" />
      </Link>
    </li>
  );
}

/** A king that's half White, half Black. */
function SplitKing() {
  return (
    <span className="relative block size-8" aria-hidden>
      <img src="/pieces/wk.svg" alt="" className="piece-img absolute inset-0 size-full" style={{ clipPath: "inset(0 50% 0 0)" }} />
      <img src="/pieces/bk.svg" alt="" className="piece-img absolute inset-0 size-full" style={{ clipPath: "inset(0 0 0 50%)" }} />
    </span>
  );
}

export function HomeModes() {
  const hydrated = useHydrated();
  // The daily number and status depend on the local date and storage, so they're client-only.
  const daily = hydrated ? dailyChallenge() : null;
  const done = daily ? loadDaily()[daily.key]?.status === "done" : false;
  return (
    <ul className="divide-y divide-line border-y border-line">
      <Row
        href="/play"
        glyph={<img src="/pieces/wk.svg" alt="" className="piece-img size-8" />}
        title="Classic Flip"
        description="Play the AI. Random, hidden color swaps."
      />
      <Row
        href="/duel"
        highlight
        glyph={<SplitKing />}
        title="Flip Duel"
        description="Play a friend online. One secret flip, and then you keep what you get."
      />
      <Row
        href="/daily"
        glyph={
          <span className="grid size-8 place-items-center rounded-[6px] border border-line text-[13px] font-semibold tabular-nums text-muted">
            {daily ? Number(daily.key.slice(-2)) : ""}
          </span>
        }
        title="Daily Flip"
        meta={daily ? <span className="text-[13px] text-faint">#{daily.number}{done ? " · played" : ""}</span> : undefined}
        description="One shared position and flip schedule a day."
      />
    </ul>
  );
}
