import { DIFFICULTY_PROFILES, parseInfoLine, chooseMove } from "./difficulty";
import type { EngineLine, MoveEngine, SearchRequest } from "./types";

const ENGINE_URL = "/engine/stockfish-19-lite-single.js";

interface Job {
  id: number;
  request: SearchRequest;
  resolve: (move: string | null) => void;
  cancelled: boolean;
}

/**
 * Stockfish (WASM) running in a dedicated Web Worker. The main thread never
 * blocks on search. Searches are serialized: a new request cancels the
 * current one (UCI "stop"), and a cancelled search's bestmove is discarded.
 */
export class StockfishEngine implements MoveEngine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private current: Job | null = null;
  private queued: Job | null = null;
  private lines = new Map<number, EngineLine>();
  private nextId = 1;
  private readyResolver: (() => void) | null = null;

  private boot(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      try {
        this.worker = new Worker(ENGINE_URL);
      } catch (err) {
        reject(err);
        return;
      }
      this.readyResolver = resolve;
      this.worker.onmessage = (e: MessageEvent) => this.onLine(String(e.data));
      this.worker.onerror = (e) => {
        console.error("Stockfish worker error", e);
        this.failAll();
      };
      this.send("uci");
      this.send("setoption name Hash value 16");
      this.send("isready");
    });
    return this.ready;
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private onLine(line: string) {
    if (line === "readyok" && this.readyResolver) {
      this.readyResolver();
      this.readyResolver = null;
      return;
    }
    const job = this.current;
    if (!job) return;
    const info = parseInfoLine(line);
    if (info) {
      this.lines.set(info.index, info.line);
      return;
    }
    if (line.startsWith("bestmove")) {
      const best = line.split(/\s+/)[1];
      this.current = null;
      if (job.cancelled) job.resolve(null);
      else if (!best || best === "(none)") job.resolve(null);
      else {
        const candidates = [...this.lines.values()];
        let move = best;
        if (candidates.length > 0) {
          try {
            move = chooseMove(candidates, job.request.difficulty, job.request.seed, job.request.fen);
          } catch {
            move = best;
          }
        }
        job.resolve(move);
      }
      this.startNext();
    }
  }

  private startNext() {
    if (this.current || !this.queued) return;
    const job = this.queued;
    this.queued = null;
    if (job.cancelled) {
      job.resolve(null);
      return;
    }
    this.current = job;
    this.lines.clear();
    const profile = DIFFICULTY_PROFILES[job.request.difficulty];
    // Clearing the hash before each search keeps results reproducible.
    this.send("ucinewgame");
    this.send(`setoption name MultiPV value ${profile.multiPv}`);
    this.send(`position fen ${job.request.fen}`);
    this.send(`go depth ${profile.depth}`);
  }

  private failAll() {
    this.current?.resolve(null);
    this.queued?.resolve(null);
    this.current = null;
    this.queued = null;
  }

  async bestMove(request: SearchRequest): Promise<string | null> {
    await this.boot();
    this.cancel();
    return new Promise((resolve) => {
      const job: Job = { id: this.nextId++, request, resolve, cancelled: false };
      if (this.queued) {
        this.queued.resolve(null);
      }
      this.queued = job;
      this.startNext();
    });
  }

  cancel(): void {
    if (this.queued) {
      this.queued.cancelled = true;
      this.queued.resolve(null);
      this.queued = null;
    }
    if (this.current && !this.current.cancelled) {
      this.current.cancelled = true;
      this.send("stop");
    }
  }

  terminate() {
    this.failAll();
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }
}

let shared: StockfishEngine | null = null;
export function getSharedEngine(): StockfishEngine {
  if (!shared) shared = new StockfishEngine();
  return shared;
}
