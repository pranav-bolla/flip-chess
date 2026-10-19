import { createRng, mixSeed, randomSeed } from "../rng";
import { generateFlipSchedule } from "../flip/schedule";
import type { Color, GameMode, GameRecord, GameSettings } from "../types";

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function resolveStartColor(choice: GameSettings["startChoice"], seed: number): Color {
  if (choice !== "random") return choice;
  return createRng(mixSeed("start-color", seed))() < 0.5 ? "w" : "b";
}

export interface CreateGameOptions {
  settings: GameSettings;
  seed?: number;
  mode?: GameMode;
  dailyNumber?: number;
  dailyKey?: string;
  startFen?: string;
  now?: number;
}

export function createGame({ settings, seed = randomSeed(), mode = "standard", dailyNumber, dailyKey, startFen, now = Date.now() }: CreateGameOptions): GameRecord {
  const startColor = resolveStartColor(settings.startChoice, seed);
  return {
    version: 1,
    sessionId: newSessionId(),
    mode,
    dailyNumber,
    dailyKey,
    seed,
    settings,
    ...(startFen ? { startFen } : {}),
    startColor,
    schedule: generateFlipSchedule(seed, settings.flips),
    moves: [],
    flips: [],
    playerColor: startColor,
    result: null,
    startedAt: now,
  };
}
