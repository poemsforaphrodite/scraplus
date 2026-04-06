import type { ReactNode } from "react";
import { clsx } from "clsx";

export function ConsolePanel({
  overline,
  title,
  description,
  children,
  className,
}: {
  overline: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        "panel-reveal relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--panel-glow)]",
        className,
      )}
    >
      <div
        className="absolute inset-x-0 top-0 h-px bg-[var(--accent)]/25"
        aria-hidden
      />
      <div className="relative">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
          {overline}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--text)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
        ) : null}
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}
