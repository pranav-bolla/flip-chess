import type { GameSummary } from "./summary";
import { colorName } from "../types";

const OUTCOME_LINE = { win: "🏆 WIN", loss: "💀 LOSS", draw: "🤝 DRAW" } as const;

/** Shareable text. Reveals how many flips happened — never when. */
export function shareText(summary: GameSummary, origin?: string): string {
  const header =
    summary.mode === "daily" && summary.dailyNumber != null
      ? `Daily #${String(summary.dailyNumber).padStart(3, "0")}`
      : "Free play";
  const flips = summary.flipsCompleted > 0 ? Array(summary.flipsCompleted).fill("🔄").join(" ") : "🚫 no flips";
  const lines = [
    "FLIP CHESS ♟️",
    header,
    "",
    OUTCOME_LINE[summary.outcome],
    flips,
    `♟️ Finished as ${colorName(summary.finalColor)}`,
    `⏱️ ${summary.moves} moves`,
    "",
    "Can you survive the flip?",
  ];
  if (origin) lines.push(origin);
  return lines.join("\n");
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
