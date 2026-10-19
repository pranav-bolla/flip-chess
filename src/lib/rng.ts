/**
 * Small deterministic PRNG utilities. Everything random in FLIP Chess
 * (flip schedules, daily challenges, AI move variety) flows through here so
 * that a seed fully reproduces a game's hidden decisions.
 */

/** 32-bit FNV-1a hash of a string. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combine several values into one 32-bit seed. */
export function mixSeed(...parts: Array<string | number>): number {
  return hashString(parts.map(String).join("␟"));
}

export type Rng = () => number;

/** mulberry32 — fast, well-distributed, and fully deterministic. Returns [0, 1). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] inclusive. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** A fresh non-deterministic seed for casual games. */
export function randomSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}
