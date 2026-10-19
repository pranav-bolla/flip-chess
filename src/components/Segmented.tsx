"use client";

import { useId, type ReactNode } from "react";

interface Option<T extends string | number> {
  value: T;
  label: ReactNode;
}

/** Segmented control. Arrow keys move the selection. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  const id = useId();
  const idx = options.findIndex((o) => o.value === value);
  return (
    <div>
      <div id={id} className="label mb-1.5">
        {label}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="grid gap-0.5 rounded-[7px] border border-line p-0.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        onKeyDown={(e) => {
          const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          onChange(options[(idx + step + options.length) % options.length].value);
        }}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={`h-8 rounded-[5px] text-[13px] transition-colors duration-100 ${
                active ? "bg-white/[0.09] text-text" : "text-muted hover:text-text"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="mt-1.5 text-[12px] text-faint">{hint}</p>}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between py-2.5 text-left">
      <span className="text-[14px]">{label}</span>
      <span className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-150 ${checked ? "bg-accent" : "bg-white/15"}`}>
        <span
          className="absolute top-[2px] size-[14px] rounded-full bg-text transition-[left] duration-150 ease-out"
          style={{ left: checked ? 16 : 2 }}
        />
      </span>
    </button>
  );
}
