"use client";

import type { Color } from "@/lib/types";

export function ColorDot({ color, size = 10 }: { color: Color; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: color === "w" ? "#ecebe7" : "#1b1b1d",
        boxShadow: color === "w" ? "none" : "inset 0 0 0 1px rgb(255 255 255 / 0.3)",
      }}
    />
  );
}

/** One line above or below the board: who, which color, and what they're doing. */
export function PlayerLine({
  name,
  detail,
  color,
  toMove,
  status,
}: {
  name: string;
  detail?: string;
  color: Color;
  toMove: boolean;
  status?: React.ReactNode;
}) {
  return (
    <div className="flex h-10 items-center gap-2.5">
      <ColorDot color={color} />
      <span className={`text-[14px] font-medium ${toMove ? "text-text" : "text-muted"}`}>{name}</span>
      {detail && <span className="text-[13px] text-faint">{detail}</span>}
      <span className="ml-auto text-[13px]">{status}</span>
    </div>
  );
}

/** Flips used, as small segments. Compact enough to sit beside other text. */
export function FlipMeter({ used, total }: { used: number; total: number }) {
  const left = total - used;
  return (
    <div className="flex items-center gap-2.5" aria-label={`${left} of ${total} flips left`}>
      <div className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-[3px] w-3.5 rounded-full transition-colors duration-300 ${i < used ? "bg-flip" : "bg-white/15"}`}
          />
        ))}
      </div>
      <span className="text-[13px] tabular-nums text-muted">
        {left === 0 ? "No flips left" : `${left} flip${left === 1 ? "" : "s"} left`}
      </span>
    </div>
  );
}
