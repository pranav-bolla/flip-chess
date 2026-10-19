# FLIP Chess

> Your greatest opponent is the position you just created.

Chess against Stockfish, except control of the colors flips at hidden moments. Same board, same position, but now you're playing your opponent's pieces. You win by checkmating with whichever color you hold at the time.

## Run

```bash
npm install
npm run dev        # http://localhost:3000 (Next.js + the Flip Duel socket server)
npm test           # vitest unit tests
npm run build && npm start
```

`server.ts` runs Next.js and a Socket.IO endpoint (`/api/duel`) on one port, so the app needs a Node host that keeps connections open: Render, Railway, Fly.io or a VPS. It won't run on Vercel. Node 22 or newer is required (pinned in `package.json` `engines`). Set `PORT` if your host requires it. Duel rooms live in memory: restarting the server ends games in progress, and you should run a single instance.

## Modes

- **Classic Flip** — play Stockfish; control swaps at hidden, random moments.
- **Flip Duel** — play a friend online in a private room. A public countdown shows how many full moves remain until you swap sides (every 3/5/10/custom moves, optionally capped).
- **Daily Flip** — everyone starts from the same named position (30 opening middlegames, each checked with Stockfish to be within a pawn of equal), with the same color, difficulty and hidden flip schedule.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · chess.js (all rules) · Stockfish 19 lite (WASM, single-threaded, in a Web Worker) · Motion · Lucide.

## Architecture

| Concern | Module |
| --- | --- |
| Chess rules (wraps chess.js, no hand-written legality) | `src/lib/chess/rules.ts` |
| Flip scheduling (seeded, spaced, hidden) | `src/lib/flip/schedule.ts` |
| Color ownership (kept separate from turn order) | `src/lib/flip/ownership.ts` |
| Game authority: phase machine, turn dispatch, stale-reply rejection | `src/lib/game/controller.ts` |
| Engine protocol + deterministic difficulty | `src/lib/engine/*` |
| Daily challenge derivation | `src/lib/daily/daily.ts` |
| Persistence (prefs, active game, history, daily) | `src/lib/storage/storage.ts` |
| Results, share text, PGN with flip metadata | `src/lib/game/{summary,share,pgn}.ts` |
| Sound playback (recorded samples, Web Audio) | `src/lib/audio/sound.ts` |
| Flip Duel rules: countdown, seat ownership, results | `src/lib/duel/rules.ts` |
| Flip Duel rooms (server-authoritative state) | `src/lib/duel/rooms.ts`, `server.ts` |
| Flip Duel client connection | `src/lib/client/duel-client.ts` |
| Daily positions | `src/lib/daily/positions.ts` |
| UI | `src/components/*`, `src/app/*` (`/`, `/play`, `/duel`, `/duel/[code]`, `/daily`, `/rules`) |

**How the controller works.** There is one chess.js position. Each game record stores the move list, the hidden schedule, the realized flip events, and `playerColor`. Phases run `player | ai → settling → (flipping →) player | ai | over`. A flip is only checked at the end of `settling`, which is after a legal move has finished and its animation has played. A flip changes `playerColor` and nothing else: FEN, castling rights, en passant, clocks and repetition history are left alone. Every timer and engine reply carries an `epoch` and a session id. Any transition (new move, flip, resign, new game) bumps the epoch, so stale replies are dropped.

**Difficulty.** Stockfish's own *Skill Level* is seeded from the clock, so it isn't reproducible. Instead each level sets a fixed search depth and a MultiPV count, and the game picks among the top lines with a softmax seeded by `(game seed, FEN, level)`. The hash is cleared before every search, so a given position with the same settings always gets the same move. Daily Flip relies on this.

**Flip Duel.** The server is the only authority. Browsers send intents (a move, resign, rematch), and the server checks them with chess.js, applies flips, decides results, and sends both players the same snapshot. A flip happens only after Black's move completes, and only if that move didn't end the game. It is recorded once, by the server, so refreshing or reconnecting can never duplicate it. Moves are refused for 1.3 s after a flip while the board turns. Each browser holds a random token that keeps its seat across refreshes; tokens are never sent to the other player.

**Daily Flip.** The local calendar date seeds the starting color, AI level, flip count, flip schedule and AI choices. You get one official attempt, tracked in localStorage. That tracking is not cheat-proof, and the page says so.

**Sound.** Moves, captures, check and checkmate are real recordings of wooden pieces (CC0, from Freesound), trimmed so each clip starts on its attack. Flips are silent. Castling plays two move samples 85 ms apart. Samples are fetched on page load, decoded into memory once the first click or keypress unlocks audio, and played through Web Audio for low latency. Normal moves rotate through three takes. The final move of a game plays only the checkmate/resignation sound. Nothing is synthesized: if a sample fails to load, that sound stays silent. Sources are in `public/sounds/CREDITS.txt`.

## Licenses

- **Stockfish** is GPLv3. The license is at `public/engine/STOCKFISH-LICENSE.txt` and the source link is on `/rules#credits`. It runs unmodified as a separate program in a Web Worker and talks to the app over UCI text messages, so the app's own code doesn't have to be GPL.
- **Pieces:** cburnett by Colin M.L. Burnett, GPLv2+, taken from chessground's assets.
- **Sounds:** CC0 (public domain), credited in `public/sounds/CREDITS.txt`.
