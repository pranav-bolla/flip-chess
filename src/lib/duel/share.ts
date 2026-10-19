import type { RoomSnapshot } from "./rooms";

/** Share text for a finished duel, from the viewer's point of view. */
export function duelShareText(snap: RoomSnapshot, origin?: string): string {
  const { game, you, players } = snap;
  const r = game.result!;
  const name = (s: 0 | 1) => players[s]?.name ?? "Player";
  let headline: string;
  if (r.winnerSeat === null) headline = "🤝 DRAW";
  else if (you === null) headline = `🏆 ${name(r.winnerSeat)} won`;
  else headline = r.winnerSeat === you ? `🏆 WIN vs ${name(you === 0 ? 1 : 0)}` : `💀 LOSS vs ${name(you === 0 ? 1 : 0)}`;
  const flips = game.flips.length ? Array(Math.min(game.flips.length, 12)).fill("🔄").join(" ") + (game.flips.length > 12 ? ` ×${game.flips.length}` : "") : "🚫 no flips";
  const lines = [
    "FLIP CHESS ♟️",
    "Flip Duel",
    "",
    headline,
    flips,
    `⏱️ ${Math.max(1, Math.ceil(game.moves.length / 2))} moves · flip every ${game.config.flipEvery}`,
    "",
    "Build the worst position. Hand it to your friend.",
  ];
  if (origin) lines.push(`${origin}/duel`);
  return lines.join("\n");
}
