"use client";

import { io, type Socket } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SOCKET_PATH, type ClientToServer, type ServerToClient } from "../duel/protocol";
import type { RoomError, RoomSnapshot } from "../duel/rooms";
import type { PromotionPiece } from "../types";

type DuelSocket = Socket<ServerToClient, ClientToServer>;

let socket: DuelSocket | null = null;

/** One shared connection; Socket.IO reconnects on its own with backoff. */
export function getSocket(): DuelSocket {
  if (!socket) socket = io({ path: SOCKET_PATH, transports: ["websocket", "polling"] });
  return socket;
}

const TOKEN_KEY = "flip-chess:duel-token:v1";
const NAME_KEY = "flip-chess:duel-name:v1";

/** A random secret identifying this browser to the server, so you keep your seat across refreshes. */
export function getToken(): string {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      t = crypto.randomUUID();
      localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
  } catch {
    // No storage: a per-tab token still works for this session.
    return (window as unknown as { __flipToken?: string }).__flipToken ??= crypto.randomUUID();
  }
}

export function getSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}

function withTimeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

export async function createRoom(name: string): Promise<string> {
  const s = getSocket();
  const res = await withTimeout(
    new Promise<Parameters<Parameters<ClientToServer["room:create"]>[1]>[0]>((resolve) =>
      s.emit("room:create", { token: getToken(), name }, resolve),
    ),
  );
  if (!res.ok) throw new Error(res.error);
  return res.code;
}

export const ERROR_TEXT: Record<RoomError | "timeout" | "offline", string> = {
  "no-room": "That room doesn't exist. It may have expired.",
  "room-full": "That room is full.",
  "bad-request": "Something went wrong with that request.",
  "not-seated": "You're watching this game.",
  "waiting-for-opponent": "Waiting for your opponent to join.",
  "game-over": "The game is over.",
  "not-your-turn": "It's not your turn.",
  illegal: "That move isn't legal.",
  "flip-in-progress": "Hold on — the board is flipping.",
  timeout: "The server isn't responding.",
  offline: "You're offline. Reconnecting…",
};

export interface PendingMove {
  gameId: string;
  ply: number;
  from: string;
  to: string;
  promotion?: PromotionPiece;
}

export type DuelStatus = "connecting" | "joined" | "error";

/**
 * Join a room and stay in sync. Re-joins automatically after any reconnect,
 * so the server always resends the authoritative state.
 */
export function useDuelRoom(code: string, name: string | null) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<DuelStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const nameRef = useRef(name);
  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  useEffect(() => {
    if (name === null) return;
    const s = getSocket();
    const join = () => {
      s.emit("room:join", { code, token: getToken(), name: nameRef.current ?? "" }, (res) => {
        if (res.ok) {
          setStatus("joined");
          setError(null);
        } else {
          setStatus("error");
          setError(ERROR_TEXT[res.error] ?? res.error);
        }
      });
    };
    const onState = (snap: RoomSnapshot) => {
      if (snap.code !== code) return;
      setSnapshot(snap);
      setClockOffset(snap.serverNow - Date.now());
      // Drop an optimistic move once the server has moved past it (or a new game started).
      setPending((p) => (p && (p.gameId !== snap.game.id || snap.game.moves.length > p.ply) ? null : p));
    };
    const onConnect = () => {
      setOnline(true);
      join();
    };
    const onDisconnect = () => setOnline(false);
    s.on("room:state", onState);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    if (s.connected) join();
    return () => {
      s.off("room:state", onState);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, [code, name]);

  const move = useCallback(
    (from: string, to: string, promotion?: PromotionPiece) => {
      if (!snapshot) return;
      const p: PendingMove = { gameId: snapshot.game.id, ply: snapshot.game.moves.length, from, to, promotion };
      setPending(p);
      getSocket().emit("game:move", { code, gameId: p.gameId, from, to, promotion }, (res) => {
        if (!res.ok) {
          setPending(null);
          setError(ERROR_TEXT[res.error] ?? res.error);
          setTimeout(() => setError(null), 2500);
        }
      });
    },
    [code, snapshot],
  );

  const resign = useCallback(() => {
    if (snapshot) getSocket().emit("game:resign", { code, gameId: snapshot.game.id }, () => {});
  }, [code, snapshot]);

  const rematch = useCallback(() => {
    getSocket().emit("game:rematch", { code }, () => {});
  }, [code]);

  return { snapshot, status, error, online, pending, clockOffset, move, resign, rematch };
}
