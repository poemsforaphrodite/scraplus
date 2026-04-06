"use client";

export function UsageMock() {
  return (
    <section className="relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--panel-glow)]">
      <div
        className="absolute inset-x-0 top-0 h-px bg-[var(--accent)]/25"
        aria-hidden
      />
      <div className="relative">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
          Usage (mock)
        </p>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--muted)]">API key</span>
            <code className="truncate font-mono text-xs text-[var(--accent-dim)]">
              sk_live_demo••••••••8f2a
            </code>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Requests (30d)</span>
            <span className="font-mono text-[var(--text)]">12,408</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Success rate</span>
            <span
              className="font-mono"
              style={{ color: "var(--status-ok)" }}
            >
              99.2%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
