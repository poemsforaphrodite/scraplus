"use client";

import { clsx } from "clsx";

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[] | readonly { value: T; label: string }[];
  ariaLabel: string;
  className?: string;
}) {
  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={clsx(
        "flex flex-wrap gap-0.5 rounded-md border border-[var(--border)] bg-[var(--bg-deep)] p-0.5",
        className,
      )}
    >
      {normalized.map(({ value: v, label }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={clsx(
            "min-w-[2.5rem] rounded px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-[11px] font-medium uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
            value === v
              ? "bg-[var(--surface-active)] text-[var(--text)] shadow-[inset_0_0_0_1px_rgba(196,245,66,0.12)]"
              : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
