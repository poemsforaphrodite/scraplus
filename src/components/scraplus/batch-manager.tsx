"use client";

import { Fragment, useCallback, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, OctagonX } from "lucide-react";
import { clsx } from "clsx";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/components/scraplus/toast";
import { UsageMock } from "@/components/scraplus/usage-mock";

const MODES = ["auto", "html", "js", "pdf", "ocr"] as const;
const FORMATS = ["html", "text", "markdown", "json"] as const;

type RowResult = {
  url: string;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
};

type BatchState = {
  status: string;
  progress?: number;
  urls?: string[];
  results?: RowResult[];
  cancelled?: boolean;
};

export function BatchManager() {
  const toast = useToast();
  const [urlsText, setUrlsText] = useState(
    "https://example.com\nhttps://example.org",
  );
  const [mode, setMode] = useState<(typeof MODES)[number]>("html");
  const [timeoutSec, setTimeoutSec] = useState(15);
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(
    () => new Set(["markdown", "text"]),
  );
  const [batchId, setBatchId] = useState<string | null>(null);
  const [state, setState] = useState<BatchState | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewFmt, setViewFmt] = useState<"markdown" | "json">("markdown");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const toggleFormat = (f: string) => {
    setSelectedFormats((prev) => {
      const n = new Set(prev);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      if (n.size === 0) n.add("text");
      return n;
    });
  };

  const pollBatch = useCallback(
    async (id: string) => {
      const deadline = Date.now() + 300_000;
      while (Date.now() < deadline) {
        const r = await fetch(`/api/v1/batch/${encodeURIComponent(id)}`);
        const d = (await r.json().catch(() => ({}))) as BatchState & {
          error?: string;
        };
        if (!r.ok) {
          toast(typeof d.error === "string" ? d.error : "Poll failed", "error");
          return;
        }
        setState(d);
        if (
          d.status === "completed" ||
          d.status === "cancelled" ||
          d.cancelled
        ) {
          toast(
            d.status === "cancelled" ? "Batch cancelled" : "Batch completed",
            d.status === "cancelled" ? "info" : "success",
          );
          return;
        }
        await new Promise((x) => setTimeout(x, 1500));
      }
      toast("Batch poll timeout", "error");
    },
    [toast],
  );

  const submitBatch = async () => {
    const lines = urlsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast("Add at least one URL", "error");
      return;
    }

    setLoading(true);
    setState(null);
    setBatchId(null);

    try {
      const res = await fetch("/api/v1/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: lines,
          mode,
          formats: [...selectedFormats],
          timeout: timeoutSec,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        batch_id?: string;
        error?: string;
      };
      if (!res.ok) {
        toast(data.error ?? `Batch failed (${res.status})`, "error");
        return;
      }
      if (typeof data.batch_id !== "string") {
        toast("Invalid batch response", "error");
        return;
      }
      setBatchId(data.batch_id);
      toast("Batch queued", "success");
      await pollBatch(data.batch_id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Batch error", "error");
    } finally {
      setLoading(false);
    }
  };

  const cancelBatch = async () => {
    if (!batchId) return;
    try {
      const res = await fetch(
        `/api/v1/batch/${encodeURIComponent(batchId)}/cancel`,
        { method: "POST" },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(
          typeof (d as { error?: string }).error === "string"
            ? (d as { error: string }).error
            : "Cancel failed",
          "error",
        );
        return;
      }
      toast("Cancel requested", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Cancel error", "error");
    }
  };

  function mdFromRow(r: RowResult): string {
    if (!r.ok || !r.result) return "";
    const c = r.result.content;
    if (c && typeof c === "object" && "markdown" in c) {
      const m = (c as { markdown?: string }).markdown;
      if (typeof m === "string") return m;
    }
    return "";
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-6">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold text-[var(--text)]">
            Batch manager
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            One URL per line — uses Modal fan-out with bounded concurrency.
          </p>

          <div className="mt-4 space-y-4">
            <label className="block space-y-1.5">
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
                URLs
              </span>
              <textarea
                value={urlsText}
                onChange={(e) => setUrlsText(e.target.value)}
                rows={8}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
                  Mode
                </span>
                <select
                  value={mode}
                  onChange={(e) =>
                    setMode(e.target.value as (typeof MODES)[number])
                  }
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm"
                >
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
                  Timeout (sec)
                </span>
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={timeoutSec}
                  onChange={(e) => setTimeoutSec(Number(e.target.value) || 15)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm"
                />
              </label>
            </div>

            <fieldset>
              <legend className="mb-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
                Formats
              </legend>
              <div className="flex flex-wrap gap-3">
                {FORMATS.map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedFormats.has(f)}
                      onChange={() => toggleFormat(f)}
                    />
                    {f}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void submitBatch()}
                className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-black hover:brightness-110 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running…
                  </>
                ) : (
                  "Start batch"
                )}
              </button>
              {batchId && (
                <button
                  type="button"
                  onClick={() => void cancelBatch()}
                  className="flex items-center gap-2 rounded-lg border border-amber-500/40 px-4 py-2 font-mono text-xs uppercase tracking-wider text-amber-200 hover:bg-amber-500/10"
                >
                  <OctagonX className="h-4 w-4" />
                  Cancel
                </button>
              )}
            </div>
          </div>
        </section>

        {state && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs text-[var(--muted)]">
                Status:{" "}
                <span className="text-[var(--text)]">{state.status}</span>
                {typeof state.progress === "number" &&
                  typeof state.urls?.length === "number" && (
                    <span className="text-[var(--muted)]">
                      {" "}
                      ({state.progress}/{state.urls.length})
                    </span>
                  )}
              </span>
              <div className="ml-auto flex gap-1 rounded-lg border border-[var(--border)] p-0.5">
                <button
                  type="button"
                  onClick={() => setViewFmt("markdown")}
                  className={clsx(
                    "rounded px-2 py-1 font-mono text-[10px] uppercase",
                    viewFmt === "markdown"
                      ? "bg-[var(--surface-active)]"
                      : "text-[var(--muted)]",
                  )}
                >
                  MD
                </button>
                <button
                  type="button"
                  onClick={() => setViewFmt("json")}
                  className={clsx(
                    "rounded px-2 py-1 font-mono text-[10px] uppercase",
                    viewFmt === "json"
                      ? "bg-[var(--surface-active)]"
                      : "text-[var(--muted)]",
                  )}
                >
                  JSON
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-black/30 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2">URL</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(state.results ?? []).map((row, i) => (
                    <Fragment key={`${i}-${row.url}`}>
                      <tr className="border-t border-[var(--border)]/80">
                        <td className="max-w-[200px] truncate px-3 py-2 font-mono text-xs text-[var(--accent-dim)] md:max-w-md">
                          {row.url}
                        </td>
                        <td className="px-3 py-2">
                          {row.ok ? (
                            <span className="text-emerald-400">ok</span>
                          ) : (
                            <span className="text-red-400">fail</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            aria-expanded={expanded[i]}
                            onClick={() =>
                              setExpanded((e) => ({
                                ...e,
                                [i]: !e[i],
                              }))
                            }
                            className="rounded p-1 hover:bg-white/10"
                          >
                            {expanded[i] ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                      </tr>
                      {expanded[i] && (
                        <tr>
                          <td colSpan={3} className="bg-black/20 px-3 py-3">
                            {!row.ok && (
                              <pre className="whitespace-pre-wrap text-xs text-red-300">
                                {row.error}
                              </pre>
                            )}
                            {row.ok && row.result && viewFmt === "markdown" && (
                              <article className="prose prose-invert prose-sm max-w-none">
                                {mdFromRow(row) ? (
                                  <ReactMarkdown>{mdFromRow(row)}</ReactMarkdown>
                                ) : (
                                  <pre className="text-xs">
                                    {JSON.stringify(row.result, null, 2)}
                                  </pre>
                                )}
                              </article>
                            )}
                            {row.ok && row.result && viewFmt === "json" && (
                              <pre className="max-h-64 overflow-auto text-xs">
                                {JSON.stringify(row.result, null, 2)}
                              </pre>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
      <UsageMock />
    </div>
  );
}
