"use client";

import { useState } from "react";

export function NamePrompt({ title, cta, onSubmit }: { title: string; cta: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  const clean = name.trim().slice(0, 20);
  return (
    <form
      className="mx-auto w-full max-w-sm px-4 py-16 sm:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean) onSubmit(clean);
      }}
    >
      <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
      <label className="label mt-6 block" htmlFor="duel-name">
        Your name
      </label>
      <input
        id="duel-name"
        autoFocus
        value={name}
        maxLength={20}
        onChange={(e) => setName(e.target.value)}
        className="mt-1.5 h-10 w-full rounded-md border border-line bg-transparent px-3 text-[14px] outline-none transition-colors focus:border-white/25"
        placeholder="So your friend knows who you are"
      />
      <button type="submit" disabled={!clean} className="btn btn-primary mt-4 h-10 w-full text-[14px]">
        {cta}
      </button>
    </form>
  );
}
