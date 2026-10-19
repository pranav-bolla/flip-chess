/**
 * FLIP Chess server: Next.js plus a Socket.IO endpoint for Flip Duel, on one port.
 *
 *   npm run dev     → development (hot reload for the Next app)
 *   npm run build && npm start → production
 *
 * Rooms live in memory, so restarting the server ends any games in progress.
 */
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { RoomStore, ROOM_CODE_RE, FLIP_LOCK_MS } from "./src/lib/duel/rooms";
import { validateConfig } from "./src/lib/duel/rules";
import { SOCKET_PATH, type ClientToServer, type ServerToClient } from "./src/lib/duel/protocol";
import type { PromotionPiece } from "./src/lib/types";

const port = Number(process.env.PORT || 3000);
const dev = process.env.NODE_ENV !== "production";

const httpServer = createServer();
const app = next({ dev, httpServer, port });
const handle = app.getRequestHandler();

interface SocketData {
  code?: string;
  token?: string;
}

const rooms = new RoomStore();
const io = new Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>(httpServer, {
  path: SOCKET_PATH,
  maxHttpBufferSize: 16 * 1024,
  // Clients re-send room:join on every (re)connect; the room keeps their seat by token.
});

const SQUARE = /^[a-h][1-8]$/;
const isToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9-]{16,64}$/.test(t);
const isCode = (c: unknown): c is string => typeof c === "string" && ROOM_CODE_RE.test(c);
const cleanName = (n: unknown) =>
  (typeof n === "string" ? n : "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 20) || "Player";
const isPromotion = (p: unknown): p is PromotionPiece | undefined => p === undefined || p === "q" || p === "r" || p === "b" || p === "n";

async function broadcast(code: string) {
  const sockets = await io.in(code).fetchSockets();
  for (const s of sockets) {
    const snap = rooms.snapshot(code, s.data.token ?? null);
    if (snap) s.emit("room:state", snap);
  }
}

io.on("connection", (socket) => {
  const leaveCurrent = () => {
    const { code, token } = socket.data;
    if (code && token) {
      rooms.connect(code, token, -1);
      socket.leave(code);
      void broadcast(code);
    }
    socket.data = {};
  };

  socket.on("room:create", (p, ack) => {
    if (typeof ack !== "function") return;
    const config = validateConfig(p?.config);
    if (!isToken(p?.token) || !config) return ack({ ok: false, error: "bad-request" });
    const code = rooms.create(p.token, cleanName(p.name), config);
    ack({ ok: true, code });
  });

  socket.on("room:join", async (p, ack) => {
    if (typeof ack !== "function") return;
    if (!isToken(p?.token) || !isCode(p?.code)) return ack({ ok: false, error: "bad-request" });
    const seat = rooms.join(p.code, p.token, cleanName(p.name));
    if (typeof seat === "string") return ack({ ok: false, error: seat });
    if (socket.data.code !== p.code || socket.data.token !== p.token) {
      leaveCurrent();
      socket.data = { code: p.code, token: p.token };
      await socket.join(p.code);
      rooms.connect(p.code, p.token, 1);
    }
    ack({ ok: true, snapshot: rooms.snapshot(p.code, p.token)! });
    void broadcast(p.code);
  });

  socket.on("game:move", (p, ack) => {
    if (typeof ack !== "function") return;
    const { code, token } = socket.data;
    if (!code || !token || p?.code !== code) return ack({ ok: false, error: "not-seated" });
    if (typeof p.gameId !== "string" || !SQUARE.test(p.from) || !SQUARE.test(p.to) || !isPromotion(p.promotion)) {
      return ack({ ok: false, error: "bad-request" });
    }
    const out = rooms.move(code, token, p.gameId, p.from, p.to, p.promotion);
    if (typeof out === "string") return ack({ ok: false, error: out });
    ack({ ok: true });
    void broadcast(code);
    // Tell clients when the post-flip lock lifts so nobody waits on a stale view.
    if (out.flipped) setTimeout(() => void broadcast(code), FLIP_LOCK_MS + 20);
  });

  socket.on("game:resign", (p, ack) => {
    if (typeof ack !== "function") return;
    const { code, token } = socket.data;
    if (!code || !token || p?.code !== code || typeof p.gameId !== "string") return ack({ ok: false, error: "not-seated" });
    const out = rooms.resign(code, token, p.gameId);
    if (out !== true) return ack({ ok: false, error: out });
    ack({ ok: true });
    void broadcast(code);
  });

  socket.on("game:rematch", (p, ack) => {
    if (typeof ack !== "function") return;
    const { code, token } = socket.data;
    if (!code || !token || p?.code !== code) return ack({ ok: false, error: "not-seated" });
    const out = rooms.rematch(code, token);
    if (typeof out === "string") return ack({ ok: false, error: out });
    ack({ ok: true });
    void broadcast(code);
  });

  socket.on("disconnect", leaveCurrent);
});

// Forget rooms idle for 6 hours with nobody connected.
setInterval(() => rooms.sweep(6 * 60 * 60 * 1000), 10 * 60 * 1000).unref();

app.prepare().then(() => {
  httpServer.on("request", (req, res) => {
    // Socket.IO handles its own path; everything else is the Next app.
    if (req.url?.startsWith(SOCKET_PATH)) return;
    void handle(req, res);
  });
  httpServer.listen(port, () => {
    console.log(`> FLIP Chess ready on http://localhost:${port} (${dev ? "development" : "production"})`);
  });
});
