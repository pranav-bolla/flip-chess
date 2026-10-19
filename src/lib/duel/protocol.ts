import type { DuelConfig } from "./rules";
import type { RoomError, RoomSnapshot } from "./rooms";
import type { PromotionPiece } from "../types";

/** Socket.IO event contract shared by the server and the browser. */

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: RoomError }) => void;

export interface ClientToServer {
  "room:create": (p: { token: string; name: string; config: DuelConfig }, ack: Ack<{ code: string }>) => void;
  "room:join": (p: { code: string; token: string; name: string }, ack: Ack<{ snapshot: RoomSnapshot }>) => void;
  "game:move": (p: { code: string; gameId: string; from: string; to: string; promotion?: PromotionPiece }, ack: Ack) => void;
  "game:resign": (p: { code: string; gameId: string }, ack: Ack) => void;
  "game:rematch": (p: { code: string }, ack: Ack) => void;
}

export interface ServerToClient {
  "room:state": (s: RoomSnapshot) => void;
}

export const SOCKET_PATH = "/api/duel";
