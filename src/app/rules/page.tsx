import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Rules · FLIP Chess" };

const RULES = [
  ["The flip", "At hidden moments, you and Stockfish swap colors. The position stays exactly as it is — castling rights, en passant, everything — and the board turns so your pieces are in front of you."],
  ["Winning", "Checkmate with whichever color you hold. If Stockfish mates you, you lose. Draws work as in normal chess, and the game ends the moment it’s decided."],
  ["Timing", "Flips are drawn at random before the game, at least three moves apart, and never depend on who’s winning. After the last one it’s ordinary chess."],
  ["Turn order", "A flip never skips a turn. If it’s White to move and you’ve just become Black, Stockfish moves first."],
  ["Flip Duel", "Play a friend online. Everyone can see the countdown: after every few full moves (White then Black), you swap sides. Checkmate with whichever color you hold."],
  ["Daily", "Everyone starts from the same named position, with the same color, difficulty and flip schedule. One attempt, tracked in this browser."],
] as const;

export default function Rules() {
  return (
    <article className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-[20px] font-semibold tracking-tight">Rules</h1>
      <dl className="mt-6 divide-y divide-line border-y border-line">
        {RULES.map(([term, text]) => (
          <div key={term} className="grid gap-1 py-4 sm:grid-cols-[120px_1fr] sm:gap-6">
            <dt className="text-[14px] font-medium">{term}</dt>
            <dd className="text-[14px] text-muted">{text}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-[13px] text-faint">
        Click or drag to move. On a focused board, arrow keys move the cursor and Enter selects. ← and → step through moves.
      </p>
      <Link href="/play" className="btn btn-primary mt-8">
        Play
      </Link>

      <section id="credits" className="mt-16 border-t border-line pt-6 text-[12px] leading-relaxed text-faint">
        <h2 className="mb-2 text-[13px] font-medium text-muted">Credits</h2>
        <p>
          Engine: <a className="underline underline-offset-2 hover:text-muted" href="https://github.com/nmrugg/stockfish.js/tree/v19.0.1">Stockfish 19 (stockfish.js)</a>, GPLv3.{" "}
          <a className="underline underline-offset-2 hover:text-muted" href="/engine/STOCKFISH-LICENSE.txt">License</a>.
        </p>
        <p>Pieces: cburnett by Colin M.L. Burnett, GPLv2+ (via lichess chessground).</p>
        <p>
          Sounds: recordings by Amatsuuu on Freesound, CC0.{" "}
          <a className="underline underline-offset-2 hover:text-muted" href="/sounds/CREDITS.txt">Details</a>.
        </p>
      </section>
    </article>
  );
}
