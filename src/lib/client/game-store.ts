"use client";

import { useSyncExternalStore } from "react";
import { GameController, type GameEvent, type GameSnapshot } from "../game/controller";
import { getSharedEngine } from "../engine/stockfish";
import { addToHistory, loadActiveGame, saveActiveGame, saveDailyEntry } from "../storage/storage";
import { summarize } from "../game/summary";
import { sounds } from "../audio/sound";
import type { GameRecord } from "../types";
import type { MoveEngine } from "../engine/types";

/**
 * Client-side singleton wiring the pure GameController to the real world:
 * Stockfish worker, localStorage persistence, and sounds. Lives at module
 * scope so it survives route changes.
 */

let controller: GameController | null = null;
const eventListeners = new Set<(e: GameEvent) => void>();

function persist(record: GameRecord | null) {
  saveActiveGame(record);
  if (record?.result) {
    const summary = summarize(record);
    if (summary) {
      addToHistory(summary);
      if (record.mode === "daily" && record.dailyKey && record.dailyNumber != null) {
        saveDailyEntry({ key: record.dailyKey, number: record.dailyNumber, sessionId: record.sessionId, status: "done", summary });
      }
    }
  }
}

/**
 * The controller emits a move event and, if that move ended the game, a
 * gameover event in the same tick. Coalesce them so the last move plays one
 * sound: the checkmate/resignation sample instead of move + ending.
 */
let pendingMove: Extract<GameEvent, { type: "move" }> | null = null;

function playSound(e: GameEvent) {
  if (e.type === "move") {
    pendingMove = e;
    queueMicrotask(() => {
      const m = pendingMove;
      pendingMove = null;
      if (!m) return;
      if (m.check) sounds.check();
      else if (m.castle) sounds.castle();
      else if (m.capture) sounds.capture();
      else sounds.move();
    });
  } else if (e.type === "gameover") {
    const reason = e.result.reason;
    if (reason === "checkmate" || reason === "resignation") {
      pendingMove = null;
      sounds.mate();
    }
    // Draws end on the final move's normal sound.
  }
}

/** Lazily constructed engine proxy so the worker only boots when the AI first moves. */
const lazyEngine: MoveEngine = {
  bestMove: (req) => getSharedEngine().bestMove(req),
  cancel: () => {
    getSharedEngine().cancel();
  },
};

export function getController(): GameController {
  if (!controller) {
    controller = new GameController({
      engine: lazyEngine,
      persist,
      onEvent: (e) => {
        playSound(e);
        for (const l of eventListeners) l(e);
      },
    });
    const saved = loadActiveGame();
    if (saved) {
      try {
        controller.load(saved);
      } catch (err) {
        console.warn("Could not restore saved game", err);
        controller.load(null);
      }
    }
  }
  return controller;
}

export function onGameEvent(l: (e: GameEvent) => void) {
  eventListeners.add(l);
  return () => {
    eventListeners.delete(l);
  };
}

const SERVER_SNAPSHOT: GameSnapshot = {
  record: null,
  phase: "idle",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  turn: "w",
  inCheck: false,
  lastMove: null,
  flip: null,
  engineError: false,
};

const subscribe = (l: () => void) => getController().subscribe(l);
const snapshot = () => getController().getSnapshot();

export function useGame(): GameSnapshot {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
}
