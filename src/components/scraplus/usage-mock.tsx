"use client";

export function UsageMock() {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
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
          <span className="font-mono text-emerald-400/90">99.2%</span>
        </div>
      </div>
    </section>
  );
}
