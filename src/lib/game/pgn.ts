import { END_REASON_LABEL, moveNumberAt } from "../chess/rules";
import { DIFFICULTY_LABEL, colorName, type GameRecord } from "../types";
import { dateKey } from "../daily/daily";

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * PGN export with FLIP metadata. Realized flips are recorded as move comments
 * at the exact ply where control switched, plus a summary tag.
 */
export function toPgn(record: GameRecord): string {
  const result = record.result
    ? record.result.winningColor === "w"
      ? "1-0"
      : record.result.winningColor === "b"
        ? "0-1"
        : "1/2-1/2"
    : "*";
  const date = dateKey(new Date(record.startedAt)).replace(/-/g, ".");
  const flipTag = record.flips.map((f) => `${f.ply}:${f.playerColor === "w" ? "White" : "Black"}`).join(" ");
  const tags: Array<[string, string]> = [
    ["Event", record.mode === "daily" ? `FLIP Chess Daily #${record.dailyNumber}` : "FLIP Chess"],
    ["Site", "FLIP Chess"],
    ["Date", date],
    ["White", "FLIP (shared control)"],
    ["Black", "FLIP (shared control)"],
    ["Result", result],
    ...(record.startFen ? ([["SetUp", "1"], ["FEN", record.startFen]] as Array<[string, string]>) : []),
    ["PlayerStartColor", colorName(record.startColor)],
    ["PlayerFinalColor", colorName(record.playerColor)],
    ["AIDifficulty", DIFFICULTY_LABEL[record.settings.difficulty]],
    ["FlipsPlanned", String(record.schedule.length)],
    ["FlipsCompleted", String(record.flips.length)],
    ["FlipEvents", flipTag || "none"],
  ];
  if (record.result) {
    tags.push(["Termination", END_REASON_LABEL[record.result.reason]]);
    tags.push(["PlayerOutcome", record.result.outcome]);
  }

  const startComment = `{Player controls ${colorName(record.startColor)}}`;
  const tokens: string[] = [startComment];
  record.moves.forEach((m, i) => {
    const { number, color } = moveNumberAt(i, record.startFen);
    if (color === "w") tokens.push(`${number}.`);
    else if (i === 0 || tokens[tokens.length - 1].startsWith("{")) tokens.push(`${number}...`);
    tokens.push(m.san);
    const flip = record.flips.find((f) => f.ply === i + 1);
    if (flip) tokens.push(`{FLIP! Player now controls ${colorName(flip.playerColor)}}`);
  });
  tokens.push(result);

  const lines: string[] = [];
  let line = "";
  for (const t of tokens) {
    if (line.length + t.length + 1 > 79) {
      lines.push(line);
      line = t;
    } else line = line ? `${line} ${t}` : t;
  }
  if (line) lines.push(line);
  return `${tags.map(([k, v]) => `[${k} "${esc(v)}"]`).join("\n")}\n\n${lines.join("\n")}\n`;
}
