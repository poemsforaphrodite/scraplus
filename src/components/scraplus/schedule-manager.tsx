"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pause, Play, Plus, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/scraplus/toast";
import { ConsolePanel } from "@/components/scraplus/console-panel";

type Schedule = {
  id: string;
  url: string;
  cron: string;
  name: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  created_at: number;
};

type Run = {
  id: string;
  status: string;
  started_at: number;
  completed_at?: number;
  result?: Record<string, unknown>;
  error?: string;
};

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Weekly (Sunday)", value: "0 0 * * 0" },
  { label: "Every 15 min", value: "*/15 * * * *" },
] as const;

export function ScheduleManager() {
  const toast = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 * * * *");
  const [selectedRuns, setSelectedRuns] = useState<Record<string, Run[]>>({});

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/schedules");
      if (res.ok) {
        const data = (await res.json()) as { schedules: Schedule[] };
        setSchedules(data.schedules || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSchedules();
  }, [fetchSchedules]);

  const createSchedule = async () => {
    if (!url.trim()) {
      toast("Enter a URL", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/v1/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          cron,
          name: name.trim() || undefined,
          scrape_options: { formats: ["markdown", "text"] },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast(data.error ?? "Failed to create schedule", "error");
        return;
      }
      toast("Schedule created", "success");
      setShowForm(false);
      setUrl("");
      setName("");
      await fetchSchedules();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setCreating(false);
    }
  };

  const toggleEnabled = async (s: Schedule) => {
    try {
      await fetch(`/api/v1/schedules/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !s.enabled }),
      });
      await fetchSchedules();
    } catch {
      toast("Failed to update", "error");
    }
  };

  const deleteSchedule = async (id: string) => {
    try {
      await fetch(`/api/v1/schedules/${id}`, { method: "DELETE" });
      toast("Schedule deleted", "info");
      await fetchSchedules();
    } catch {
      toast("Failed to delete", "error");
    }
  };

  const viewRuns = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/schedules/${id}/runs`);
      if (res.ok) {
        const data = (await res.json()) as { runs: Run[] };
        setSelectedRuns((prev) => ({ ...prev, [id]: data.runs || [] }));
      }
    } catch {
      // silent
    }
  };

  return (
    <div className="space-y-6">
      <ConsolePanel
        className="panel-reveal"
        overline="Schedules"
        title="Recurring scrapes"
        description="Set up cron-based schedules that automatically scrape URLs at regular intervals."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-[var(--muted)]">
              {schedules.length} schedule{schedules.length !== 1 ? "s" : ""}
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
                  URL
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
                  placeholder="My schedule"
                />
              </label>
              <div className="space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                  Cron expression
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
                <input
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                />
              </div>
              <button
                type="button"
                disabled={creating}
                onClick={() => void createSchedule()}
                className="flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-black transition hover:brightness-110 disabled:opacity-50"
              >
                {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create schedule
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
            </div>
          ) : schedules.length === 0 ? (
            <p className="py-8 text-center font-mono text-sm text-[var(--muted)]">
              No schedules yet. Create one above.
            </p>
          ) : (
            <div className="space-y-2">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text)]">
                        {s.name || s.url}
                      </p>
                      {s.name && (
                        <p className="truncate font-mono text-xs text-[var(--accent-dim)]">
                          {s.url}
                        </p>
                      )}
                      <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">
                        <code>{s.cron}</code>
                        {s.next_run_at && (
                          <span className="ml-2">
                            Next: {new Date(s.next_run_at).toLocaleString()}
                          </span>
                        )}
                        <span className="ml-2">{s.run_count} runs</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => void toggleEnabled(s)}
                        className={clsx(
                          "rounded p-1.5 transition",
                          s.enabled
                            ? "text-[var(--status-ok)] hover:bg-[var(--status-ok)]/10"
                            : "text-[var(--muted)] hover:bg-white/5",
                        )}
                        title={s.enabled ? "Pause" : "Resume"}
                      >
                        {s.enabled ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteSchedule(s.id)}
                        className="rounded p-1.5 text-[var(--muted)] transition hover:bg-red-500/10 hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void viewRuns(s.id)}
                    className="mt-2 font-mono text-[10px] uppercase text-[var(--accent-dim)] hover:text-[var(--accent)]"
                  >
                    View runs
                  </button>
                  {selectedRuns[s.id] && (
                    <div className="mt-2 max-h-40 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-deep)]">
                      {selectedRuns[s.id].length === 0 ? (
                        <p className="p-2 text-center font-mono text-xs text-[var(--muted)]">
                          No runs yet
                        </p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[var(--border)] font-mono text-[10px] uppercase text-[var(--muted)]">
                              <th className="px-2 py-1 text-left">Status</th>
                              <th className="px-2 py-1 text-left">Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedRuns[s.id].map((r, i) => (
                              <tr
                                key={i}
                                className="border-t border-[var(--border)]/50"
                              >
                                <td className="px-2 py-1">
                                  <span
                                    className={
                                      r.status === "completed"
                                        ? "text-[var(--status-ok)]"
                                        : "text-[var(--status-err)]"
                                    }
                                  >
                                    {r.status}
                                  </span>
                                </td>
                                <td className="px-2 py-1 text-[var(--muted)]">
                                  {new Date(
                                    r.started_at * 1000,
                                  ).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
