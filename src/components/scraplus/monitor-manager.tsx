"use client";

import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/scraplus/toast";
import { ConsolePanel } from "@/components/scraplus/console-panel";

type Monitor = {
  id: string;
  url: string;
  cron: string;
  name: string;
  enabled: boolean;
  diff_mode: string;
  last_check_at: string | null;
  change_count: number;
  check_count: number;
  created_at: number;
};

type Change = {
  id?: string;
  checked_at?: number;
  status?: string;
  diff?: string;
  fields?: Record<string, { changed: boolean; old?: string; new?: string; value?: string }>;
};

const DIFF_MODES = ["exact", "semantic", "selector"] as const;

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6h", value: "0 */6 * * *" },
  { label: "Daily", value: "0 0 * * *" },
  { label: "Every 15 min", value: "*/15 * * * *" },
] as const;

export function MonitorManager() {
  const toast = useToast();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 * * * *");
  const [diffMode, setDiffMode] = useState<string>("exact");
  const [changes, setChanges] = useState<Record<string, Change[]>>({});

  const fetchMonitors = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/monitors");
      if (res.ok) {
        const data = (await res.json()) as { monitors: Monitor[] };
        setMonitors(data.monitors || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMonitors();
  }, [fetchMonitors]);

  const createMonitor = async () => {
    if (!url.trim()) {
      toast("Enter a URL", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/v1/monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          cron,
          name: name.trim() || undefined,
          diff_mode: diffMode,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast(data.error ?? "Failed to create monitor", "error");
        return;
      }
      toast("Monitor created", "success");
      setShowForm(false);
      setUrl("");
      setName("");
      await fetchMonitors();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setCreating(false);
    }
  };

  const deleteMonitor = async (id: string) => {
    try {
      await fetch(`/api/v1/monitors/${id}`, { method: "DELETE" });
      toast("Monitor deleted", "info");
      await fetchMonitors();
    } catch {
      toast("Failed to delete", "error");
    }
  };

  const viewChanges = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/monitors/${id}/changes`);
      if (res.ok) {
        const data = (await res.json()) as { changes: Change[] };
        setChanges((prev) => ({ ...prev, [id]: data.changes || [] }));
      }
    } catch {
      // silent
    }
  };

  return (
    <div className="space-y-6">
      <ConsolePanel
        className="panel-reveal"
        overline="Monitors"
        title="Change detection"
        description="Monitor URLs for content changes. Get notified via webhook when something changes."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-[var(--muted)]">
              {monitors.length} monitor{monitors.length !== 1 ? "s" : ""}
            </p>
            <button
              type="button"
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-black transition hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          </div>

          {showForm && (
            <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] p-4">
              <label className="block space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                  URL to monitor
                </span>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  placeholder="https://example.com"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                  Name (optional)
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                    Check interval
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {CRON_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setCron(p.value)}
                        className={clsx(
                          "rounded border px-2 py-1 font-mono text-[10px] transition",
                          cron === p.value
                            ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
                            : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]",
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                    Diff mode
                  </span>
                  <div className="flex gap-1.5">
                    {DIFF_MODES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDiffMode(m)}
                        className={clsx(
                          "rounded border px-2 py-1 font-mono text-[10px] transition",
                          diffMode === m
                            ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]"
                            : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]",
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={creating}
                onClick={() => void createMonitor()}
                className="flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-black transition hover:brightness-110 disabled:opacity-50"
              >
                {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create monitor
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
            </div>
          ) : monitors.length === 0 ? (
            <p className="py-8 text-center font-mono text-sm text-[var(--muted)]">
              No monitors yet. Create one above.
            </p>
          ) : (
            <div className="space-y-2">
              {monitors.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text)]">
                        {m.name || m.url}
                      </p>
                      {m.name && (
                        <p className="truncate font-mono text-xs text-[var(--accent-dim)]">
                          {m.url}
                        </p>
                      )}
                      <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">
                        <code>{m.cron}</code>
                        <span className="ml-2">{m.diff_mode} diff</span>
                        <span className="ml-2">{m.check_count} checks</span>
                        <span className="ml-2">{m.change_count} changes</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => void viewChanges(m.id)}
                        className="rounded p-1.5 text-[var(--muted)] transition hover:bg-white/5 hover:text-[var(--text)]"
                        title="View changes"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteMonitor(m.id)}
                        className="rounded p-1.5 text-[var(--muted)] transition hover:bg-red-500/10 hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {changes[m.id] && (
                    <div className="mt-2 max-h-48 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-deep)]">
                      {changes[m.id].length === 0 ? (
                        <p className="p-2 text-center font-mono text-xs text-[var(--muted)]">
                          No changes detected yet
                        </p>
                      ) : (
                        <div className="divide-y divide-[var(--border)]/50">
                          {changes[m.id].map((c, i) => (
                            <div key={i} className="p-2">
                              <p className="font-mono text-[10px] text-[var(--muted)]">
                                <span
                                  className={
                                    c.status === "changed"
                                      ? "text-amber-400"
                                      : "text-[var(--status-ok)]"
                                  }
                                >
                                  {c.status}
                                </span>
                                {c.checked_at && (
                                  <span className="ml-2">
                                    {new Date(c.checked_at * 1000).toLocaleString()}
                                  </span>
                                )}
                              </p>
                              {c.diff && (
                                <pre className="mt-1 max-h-24 overflow-auto font-mono text-[10px] text-zinc-400">
                                  {c.diff}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </ConsolePanel>
    </div>
  );
}
