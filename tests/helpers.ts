import { Chess } from "chess.js";
import type { MoveEngine, SearchRequest } from "@/lib/engine/types";
import { createRng } from "@/lib/rng";

/** A controllable fake engine: replies are held until released. */
export class FakeEngine implements MoveEngine {
  requests: SearchRequest[] = [];
  private pending: Array<{ req: SearchRequest; resolve: (m: string | null) => void }> = [];
  cancels = 0;
  auto: ((req: SearchRequest) => string | null) | null = null;

  bestMove(req: SearchRequest): Promise<string | null> {
    this.requests.push(req);
    if (this.auto) return Promise.resolve(this.auto(req));
    return new Promise((resolve) => this.pending.push({ req, resolve }));
  }
  cancel() {
    this.cancels++;
    // Mimic StockfishEngine: in-flight searches resolve null when cancelled.
    for (const p of this.pending.splice(0)) p.resolve(null);
  }
  /** Reply to the oldest pending request with a given move or a random legal one. */
  reply(move?: string) {
    const p = this.pending.shift();
    if (!p) throw new Error("no pending request");
    p.resolve(move ?? randomLegal(p.req.fen, 1));
  }
  /** Resolve the oldest request *without* removing knowledge of it (stale reply simulation). */
  takePending() {
    return this.pending.shift();
  }
  get pendingCount() {
    return this.pending.length;
  }
}

export function randomLegal(fen: string, seed: number): string {
  const c = new Chess(fen);
  const moves = c.moves({ verbose: true });
  const rng = createRng(seed + moves.length);
  const m = moves[Math.floor(rng() * moves.length)];
  return m.from + m.to + (m.promotion ?? "");
}

/** Flush promise microtasks. */
export async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
