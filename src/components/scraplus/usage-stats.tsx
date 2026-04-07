"use client";

import { useCallback, useEffect, useState } from "react";

type UsageData = {
  total_requests: number;
  success: number;
  failed: number;
  last_request_at: string | null;
};

export function UsageStats() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/usage");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // fall through
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsage();
  }, [fetchUsage]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="h-4 w-24 rounded bg-[var(--border)]" />
        <div className="h-8 w-32 rounded bg-[var(--border)]" />
      </div>
    );
  }

  const d = data ?? {
    total_requests: 0,
    success: 0,
    failed: 0,
    last_request_at: null,
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
          Total requests
        </p>
        <p className="mt-1 font-mono text-2xl font-semibold text-[var(--text)]">
          {d.total_requests.toLocaleString()}
        </p>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
          Successful
        </p>
        <p className="mt-1 font-mono text-2xl font-semibold text-[var(--status-ok)]">
          {d.success.toLocaleString()}
        </p>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
          Failed
        </p>
        <p className="mt-1 font-mono text-2xl font-semibold text-[var(--status-err)]">
          {d.failed.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
