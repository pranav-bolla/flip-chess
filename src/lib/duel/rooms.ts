import type { Chess } from "chess.js";
import type { PromotionPiece } from "../types";
import {
  applyDuelMove,
  duelPosition,
  newDuelGame,
  otherSeat,
  resignDuel,
  type DuelConfig,
  type DuelGame,
  type MoveRejection,
  type Seat,
} from "./rules";

/**
 * In-memory private rooms. The server is the only authority: clients send
 * intents (move, resign, rematch) and receive snapshots. Player identity is a
 * random token kept in the player's browser; it is never sent to anyone else.
 */

export const FLIP_LOCK_MS = 1300;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export const ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

interface Player {
  token: string;
  name: string;
  /** Live connection count (a player may have several tabs). */
  connections: number;
}

interface Room {
  code: string;
  players: [Player | null, Player | null];
  game: DuelGame;
  chess: Chess;
  rematch: Set<Seat>;
  gameCounter: number;
  lastActive: number;
}

export interface PublicPlayer {
  name: string;
  connected: boolean;
}

export interface RoomSnapshot {
  code: string;
  /** Your seat, or null if you're watching. */
  you: Seat | null;
  players: [PublicPlayer | null, PublicPlayer | null];
  game: DuelGame;
  rematchVotes: Seat[];
  serverNow: number;
}

export type RoomError = "no-room" | "room-full" | "bad-request" | "not-seated" | "waiting-for-opponent" | MoveRejection;

export class RoomStore {
  private rooms = new Map<string, Room>();

  constructor(
    private now: () => number = () => Date.now(),
    private random: () => number = Math.random,
  ) {}

  private newCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  create(token: string, name: string, config: DuelConfig): string {
    const code = this.newCode();
    const game = newDuelGame(`${code}-1`, config, 0);
    this.rooms.set(code, {
      code,
      players: [{ token, name, connections: 0 }, null],
      game,
      chess: duelPosition(game),
      rematch: new Set(),
      gameCounter: 1,
      lastActive: this.now(),
    });
    return code;
  }

  has(code: string) {
    return this.rooms.has(code);
  }

  /** Seat a player (or reconnect them by token). Returns their seat, or null when watching. */
  join(code: string, token: string, name: string): Seat | null | RoomError {
    const room = this.rooms.get(code);
    if (!room) return "no-room";
    room.lastActive = this.now();
    const existing = room.players.findIndex((p) => p?.token === token);
    if (existing !== -1) {
      room.players[existing]!.name = name || room.players[existing]!.name;
      return existing as Seat;
    }
    if (!room.players[1]) {
      room.players[1] = { token, name, connections: 0 };
      return 1;
    }
    return null;
  }

  connect(code: string, token: string, delta: 1 | -1) {
    const room = this.rooms.get(code);
    const p = room?.players.find((x) => x?.token === token);
    if (p) p.connections = Math.max(0, p.connections + delta);
  }

  private seatOf(room: Room, token: string): Seat | null {
    const i = room.players.findIndex((p) => p?.token === token);
    return i === -1 ? null : (i as Seat);
  }

  move(code: string, token: string, gameId: string, from: string, to: string, promotion?: PromotionPiece): { flipped: boolean } | RoomError {
    const room = this.rooms.get(code);
    if (!room) return "no-room";
    const seat = this.seatOf(room, token);
    if (seat === null) return "not-seated";
    if (!room.players[0] || !room.players[1]) return "waiting-for-opponent";
    if (gameId !== room.game.id) return "game-over"; // a stale move for a finished game
    const out = applyDuelMove(room.game, room.chess, seat, from, to, promotion, this.now(), FLIP_LOCK_MS);
    if (typeof out === "string") return out;
    room.game = out.game;
    room.rematch.clear();
    room.lastActive = this.now();
    return { flipped: out.flipped };
  }

  resign(code: string, token: string, gameId: string): true | RoomError {
    const room = this.rooms.get(code);
    if (!room) return "no-room";
    const seat = this.seatOf(room, token);
    if (seat === null) return "not-seated";
    if (gameId !== room.game.id) return "game-over";
    const next = resignDuel(room.game, seat);
    if (!next) return "game-over";
    room.game = next;
    room.lastActive = this.now();
    return true;
  }

  /** Vote for a rematch; when both seats agree, colors swap and a new game starts. */
  rematch(code: string, token: string): { started: boolean } | RoomError {
    const room = this.rooms.get(code);
    if (!room) return "no-room";
    const seat = this.seatOf(room, token);
    if (seat === null) return "not-seated";
    if (!room.game.result) return "bad-request";
    room.rematch.add(seat);
    if (room.rematch.size < 2) return { started: false };
    room.gameCounter += 1;
    room.game = newDuelGame(`${code}-${room.gameCounter}`, room.game.config, otherSeat(room.game.startWhiteSeat));
    room.chess = duelPosition(room.game);
    room.rematch.clear();
    room.lastActive = this.now();
    return { started: true };
  }

  snapshot(code: string, token: string | null): RoomSnapshot | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    const pub = (p: Player | null): PublicPlayer | null => (p ? { name: p.name, connected: p.connections > 0 } : null);
    return {
      code,
      you: token ? this.seatOf(room, token) : null,
      players: [pub(room.players[0]), pub(room.players[1])],
      game: room.game,
      rematchVotes: [...room.rematch],
      serverNow: this.now(),
    };
  }

  /** Drop rooms nobody has touched for a while. */
  sweep(maxIdleMs: number) {
    const cutoff = this.now() - maxIdleMs;
    for (const [code, room] of this.rooms) {
      const anyoneHere = room.players.some((p) => p && p.connections > 0);
      if (!anyoneHere && room.lastActive < cutoff) this.rooms.delete(code);
    }
  }
}
