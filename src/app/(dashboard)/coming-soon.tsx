export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-8 py-16 text-center">
      <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.35em] text-[var(--muted)]">
        Coming soon
      </p>
      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--text)]">
        {title}
      </h2>
      <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
        This module is not wired yet. Scrape and Batch are fully operational.
      </p>
    </div>
  );
}
