"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoom, ERROR_TEXT, getSavedName, saveName } from "@/lib/client/duel-client";
import { useHydrated } from "@/lib/client/prefs";

export function DuelCreate() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="flex-1" />;
  return <DuelCreateInner />;
}

function DuelCreateInner() {
  const router = useRouter();
  const [name, setName] = useState(getSavedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");

  const clean = name.trim().slice(0, 20);
  const code = joinCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  const create = async () => {
    if (!clean) return;
    setBusy(true);
    setError(null);
    saveName(clean);
    try {
      const roomCode = await createRoom(clean);
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
      <p className="mt-1 text-[16px] text-muted">At one secret moment you swap sides with your friend, for good. It could be any move, so don&apos;t wreck what might become yours.</p>

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
