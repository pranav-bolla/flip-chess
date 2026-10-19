import type { Color, Controller, FlipEvent } from "../types";
import { opposite } from "../types";

/**
 * Color ownership is deliberately independent from chess turn order.
 * The chess position decides *whose turn* it is; ownership decides *who*
 * (player or AI) controls that color right now.
 */

export function controllerOf(color: Color, playerColor: Color): Controller {
  return color === playerColor ? "player" : "ai";
}

export function aiColorOf(playerColor: Color): Color {
  return opposite(playerColor);
}

/** The ownership change caused by a flip at `ply`. Pure: no chess state is touched. */
export function flipOwnership(playerColor: Color, ply: number): FlipEvent {
  return { ply, playerColor: opposite(playerColor) };
}

/** Player color in effect after `plies` completed, given recorded flip events. */
export function playerColorAtPly(startColor: Color, flips: readonly FlipEvent[], plies: number): Color {
  let color = startColor;
  for (const f of flips) {
    if (f.ply <= plies) color = f.playerColor;
  }
  return color;
}
