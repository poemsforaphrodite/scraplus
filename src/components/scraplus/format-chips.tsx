"use client";

import { clsx } from "clsx";

export function FormatChips({
  formats,
  selected,
  onToggle,
  legend,
}: {
  formats: readonly string[];
  selected: Set<string>;
  onToggle: (f: string) => void;
  legend: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {formats.map((f) => {
          const on = selected.has(f);
          return (
            <button
              key={f}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => onToggle(f)}
              className={clsx(
                "rounded-full border px-3 py-1.5 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                on
                  ? "border-[var(--accent)]/40 bg-[var(--surface-active)] text-[var(--text)] shadow-[var(--panel-glow)]"
                  : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-white/5 hover:text-[var(--text)]",
              )}
            >
              {f}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
