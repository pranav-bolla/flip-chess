/**
 * Recorded chess sounds played through Web Audio.
 *
 * Samples are real recordings of wooden pieces (CC0, see public/sounds/CREDITS.md),
 * trimmed to start on the attack so playback feels instant. Files are fetched
 * early, decoded once the AudioContext exists, and played from memory. The
 * context is created/resumed on the first user gesture, as browsers require.
 *
 * If a sample hasn't loaded, nothing plays — there is no synthesized fallback.
 */

const FILES = {
  move1: "/sounds/move-1.wav",
  move2: "/sounds/move-2.wav",
  move3: "/sounds/move-3.wav",
  capture: "/sounds/capture.wav",
  check: "/sounds/check.wav",
  mate: "/sounds/mate.wav",
} as const;

type SampleName = keyof typeof FILES;

const GAIN: Record<SampleName, number> = {
  move1: 0.5,
  move2: 0.5,
  move3: 0.5,
  capture: 0.62,
  check: 0.5,
  mate: 0.55,
};

const MASTER_VOLUME = 0.8;
const MOVE_VARIANTS: SampleName[] = ["move1", "move2", "move3"];

let enabled = true;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let rawFetch: Promise<Partial<Record<SampleName, ArrayBuffer>>> | null = null;
let decoding: Promise<void> | null = null;
const buffers: Partial<Record<SampleName, AudioBuffer>> = {};
const lastPlayed: Partial<Record<string, number>> = {};
let variant = 0;

export function setSoundEnabled(v: boolean) {
  enabled = v;
  if (v) prefetch();
}

/** Start downloading samples (no AudioContext needed yet). */
function prefetch() {
  if (rawFetch || typeof window === "undefined") return;
  rawFetch = Promise.all(
    (Object.keys(FILES) as SampleName[]).map(async (name) => {
      try {
        const res = await fetch(FILES[name]);
        return [name, await res.arrayBuffer()] as const;
      } catch {
        return [name, null] as const;
      }
    }),
  ).then((entries) => Object.fromEntries(entries.filter(([, b]) => b)) as Partial<Record<SampleName, ArrayBuffer>>);
}

/** Create/resume the context and decode samples. Safe to call repeatedly. */
function unlock() {
  if (typeof window === "undefined") return;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC({ latencyHint: "interactive" });
      master = ctx.createGain();
      master.gain.value = MASTER_VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    if (!decoding) {
      prefetch();
      const context = ctx;
      decoding = rawFetch!.then(async (raw) => {
        await Promise.all(
          (Object.keys(raw) as SampleName[]).map(async (name) => {
            try {
              // decodeAudioData detaches the buffer, so decode a copy.
              buffers[name] = await context.decodeAudioData(raw[name]!.slice(0));
            } catch {
              // Leave missing; that sound simply won't play.
            }
          }),
        );
      });
    }
  } catch {
    // Audio unavailable — the game works silently.
  }
}

if (typeof window !== "undefined") {
  prefetch();
  const onGesture = () => {
    unlock();
    if (ctx?.state === "running") {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
    }
  };
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("keydown", onGesture, true);
}

function play(name: SampleName, { delay = 0, gain = 1, key = name as string } = {}) {
  if (!enabled) return;
  unlock();
  const buffer = buffers[name];
  if (!ctx || !master || !buffer) return;
  // Guard against duplicate triggers of the same event in the same instant.
  const now = ctx.currentTime;
  if (delay === 0 && lastPlayed[key] !== undefined && now - lastPlayed[key]! < 0.03) return;
  lastPlayed[key] = now;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.value = GAIN[name] * gain;
  src.connect(g).connect(master);
  src.start(now + delay);
}

function nextMove(): SampleName {
  variant = (variant + 1) % MOVE_VARIANTS.length;
  return MOVE_VARIANTS[variant];
}

export const sounds = {
  move: () => play(nextMove(), { key: "move" }),
  capture: () => play("capture"),
  check: () => play("check"),
  /** King, then rook: two quick placements. */
  castle: () => {
    play(nextMove(), { key: "castle-1" });
    play(nextMove(), { delay: 0.085, gain: 0.8, key: "castle-2" });
  },
  /** Final placement and the king going over. Also used for resignation. */
  mate: () => play("mate"),
};
