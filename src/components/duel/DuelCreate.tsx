"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Segmented } from "../Segmented";
import { createRoom, ERROR_TEXT, getSavedName, saveName } from "@/lib/client/duel-client";
import { updatePrefs, usePrefs, useHydrated } from "@/lib/client/prefs";
import { FLIP_EVERY_LIMITS } from "@/lib/duel/rules";

const PRESETS = [3, 5, 10];
const MAX_FLIP_OPTIONS = [null, 3, 5, 10] as const;

export function DuelCreate() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="flex-1" />;
  return <DuelCreateInner />;
}

function DuelCreateInner() {
  const router = useRouter();
  const prefs = usePrefs();
  const cfg = prefs.duel;
  const [name, setName] = useState(getSavedName);
  const [custom, setCustom] = useState(!PRESETS.includes(cfg.flipEvery));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");

  const setFlipEvery = (n: number) => updatePrefs({ duel: { ...cfg, flipEvery: Math.max(FLIP_EVERY_LIMITS.min, Math.min(FLIP_EVERY_LIMITS.max, Math.round(n) || 5)) } });
  const clean = name.trim().slice(0, 20);
  const code = joinCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  const create = async () => {
    if (!clean) return;
    setBusy(true);
    setError(null);
    saveName(clean);
    try {
      const roomCode = await createRoom(clean, cfg);
      router.push(`/duel/${roomCode}`);
    } catch (e) {
      const key = (e as Error).message as keyof typeof ERROR_TEXT;
      setError(ERROR_TEXT[key] ?? "Couldn't reach the server.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-[32px] font-semibold tracking-[-0.02em]">Flip Duel</h1>
      <p className="mt-1 text-[16px] text-muted">Every {cfg.flipEvery} moves you swap sides with your friend. Make sure they inherit something awful.</p>

      <div className="mt-8 space-y-4">
        <div>
          <label className="label mb-1.5 block" htmlFor="duel-name">
            Your name
          </label>
          <input
            id="duel-name"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-md border border-line bg-transparent px-3 text-[14px] outline-none transition-colors focus:border-white/25"
          />
        </div>
        <Segmented<number | "custom">
          label="Flip every"
          value={custom ? "custom" : cfg.flipEvery}
          onChange={(v) => {
            if (v === "custom") setCustom(true);
            else {
              setCustom(false);
              setFlipEvery(v);
            }
          }}
          options={[...PRESETS.map((n) => ({ value: n, label: `${n} moves` })), { value: "custom" as const, label: "Custom" }]}
        />
        {custom && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={FLIP_EVERY_LIMITS.min}
              max={FLIP_EVERY_LIMITS.max}
              value={cfg.flipEvery}
              onChange={(e) => setFlipEvery(Number(e.target.value))}
              className="h-9 w-20 rounded-md border border-line bg-transparent px-3 text-[14px] tabular-nums outline-none focus:border-white/25"
              aria-label="Full moves between flips"
            />
            <span className="text-[13px] text-muted">full moves between flips</span>
          </div>
        )}
        <Segmented<number | "unlimited">
          label="Total flips"
          value={cfg.maxFlips ?? "unlimited"}
          onChange={(v) => updatePrefs({ duel: { ...cfg, maxFlips: v === "unlimited" ? null : v } })}
          options={MAX_FLIP_OPTIONS.map((n) => ({ value: n ?? ("unlimited" as const), label: n ?? "Unlimited" }))}
        />
        <button onClick={create} disabled={!clean || busy} className="btn btn-primary h-10 w-full text-[14px]">
          {busy ? "Creating…" : "Create private room"}
        </button>
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>

      <form
        className="mt-10 border-t border-line pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) router.push(`/duel/${code}`);
        }}
      >
        <label className="label mb-1.5 block" htmlFor="join-code">
          Have a code?
        </label>
        <div className="flex gap-2">
          <input
            id="join-code"
            value={code}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="ABC234"
            autoCapitalize="characters"
            className="h-9 min-w-0 flex-1 rounded-md border border-line bg-transparent px-3 text-[14px] uppercase tracking-[0.12em] outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-faint focus:border-white/25"
          />
          <button type="submit" disabled={code.length !== 6} className="btn btn-secondary">
            Join
          </button>
        </div>
      </form>
    </div>
  );
}
