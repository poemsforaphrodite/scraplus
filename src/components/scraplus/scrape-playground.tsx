"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { ResponseViewer } from "@/components/scraplus/response-viewer";
import { UsageMock } from "@/components/scraplus/usage-mock";
import { useToast } from "@/components/scraplus/toast";
import { ConsolePanel } from "@/components/scraplus/console-panel";
import { SegmentedControl } from "@/components/scraplus/segmented-control";
import { FormatChips } from "@/components/scraplus/format-chips";

const MODES = ["auto", "html", "js", "pdf", "ocr"] as const;
const FORMATS = ["html", "text", "markdown", "json"] as const;

export function ScrapePlayground() {
  const toast = useToast();
  const [url, setUrl] = useState("https://example.com");
  const [mode, setMode] = useState<(typeof MODES)[number]>("auto");
  const [timeoutSec, setTimeoutSec] = useState(15);
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(
    () => new Set(["markdown", "text", "json"]),
  );
  const [headersJson, setHeadersJson] = useState("");
  const [waitFor, setWaitFor] = useState("");
  const [screenshot, setScreenshot] = useState(false);
  const [asyncJob, setAsyncJob] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pollLoading, setPollLoading] = useState(false);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleFormat = (f: string) => {
    setSelectedFormats((prev) => {
      const n = new Set(prev);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      if (n.size === 0) n.add("text");
      return n;
    });
  };

  const runScrape = useCallback(async () => {
    setLoading(true);
    setPollLoading(false);
    setError(null);
    setResult(null);
    setHttpStatus(null);

    let headers: Record<string, string> | undefined;
    if (headersJson.trim()) {
      try {
        const parsed = JSON.parse(headersJson) as unknown;
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
          throw new Error("Headers must be a JSON object");
        headers = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") headers[k] = v;
        }
      } catch (e) {
        setLoading(false);
        setError(e instanceof Error ? e.message : "Invalid headers JSON");
        toast("Invalid headers JSON", "error");
        return;
      }
    }

    const body: Record<string, unknown> = {
      url: url.trim(),
      mode,
      formats: [...selectedFormats],
      timeout: timeoutSec,
      async: asyncJob,
    };
    if (headers && Object.keys(headers).length) body.headers = headers;
    if (waitFor.trim() && (mode === "js" || mode === "auto")) {
      body.wait_for = waitFor.trim();
    }
    if (screenshot && (mode === "js" || mode === "auto")) {
      body.screenshot = true;
    }

    try {
      const res = await fetch("/api/v1/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setHttpStatus(res.status);
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!res.ok) {
        const msg =
          typeof data.error === "string" ? data.error : JSON.stringify(data);
        setError(msg);
        toast(`Scrape failed (${res.status})`, "error");
        return;
      }

      if (asyncJob && typeof data.job_id === "string") {
        toast("Job started — polling…", "info");
        setPollLoading(true);
        const jobId = data.job_id;
        const deadline = Date.now() + 90_000;
        let final: Record<string, unknown> | null = null;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1200));
          const jr = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`);
          const jd = (await jr.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          if (!jr.ok) {
            setError(
              typeof jd.error === "string" ? jd.error : "Job poll failed",
            );
            toast("Job poll failed", "error");
            setPollLoading(false);
            return;
          }
          const st = jd.status;
          if (st === "completed" && jd.result) {
            final = jd.result as Record<string, unknown>;
            break;
          }
          if (st === "failed") {
            setError(typeof jd.error === "string" ? jd.error : "Job failed");
            toast("Job failed", "error");
            setPollLoading(false);
            return;
          }
        }
        setPollLoading(false);
        if (final) {
          setResult(final);
          toast("Scrape completed", "success");
        } else {
          setError("Timed out waiting for job");
          toast("Job timeout", "error");
        }
        return;
      }

      setResult(data);
      toast("Scrape completed", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      setError(msg);
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [
    url,
    mode,
    selectedFormats,
    timeoutSec,
    headersJson,
    waitFor,
    screenshot,
    asyncJob,
    toast,
  ]);

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void runScrape();
    }
  }

  const busy = loading || pollLoading;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-6">
        <ConsolePanel
          className="panel-reveal"
          overline="POST /api/v1/scrape"
          title="Scrape playground"
          description={
            "Configure a request — Cmd+Enter or Ctrl+Enter to run when focused."
          }
        >
          <div className="space-y-4" onKeyDown={onKeyDown}>
            <label className="block space-y-1.5">
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
                URL
              </span>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                autoComplete="off"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="block font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
                  Mode
                </span>
                <SegmentedControl
                  ariaLabel="Scrape mode"
                  value={mode}
                  onChange={setMode}
                  options={MODES}
                />
              </div>
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
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                />
              </label>
            </div>

            <FormatChips
              legend="Formats"
              formats={FORMATS}
              selected={selectedFormats}
              onToggle={toggleFormat}
            />

            <label className="block space-y-1.5">
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
                Custom headers (JSON object)
              </span>
              <textarea
                value={headersJson}
                onChange={(e) => setHeadersJson(e.target.value)}
                rows={3}
                placeholder='{"Accept-Language": "en-US"}'
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              />
            </label>

            {(mode === "js" || mode === "auto") && (
              <>
                <label className="block space-y-1.5">
                  <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
                    wait_for selector (Playwright)
                  </span>
                  <input
                    value={waitFor}
                    onChange={(e) => setWaitFor(e.target.value)}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    placeholder="#main"
                  />
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={screenshot}
                    onChange={(e) => setScreenshot(e.target.checked)}
                    className="rounded border-[var(--border)]"
                  />
                  Request screenshot (PNG base64 in response)
                </label>
              </>
            )}

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={asyncJob}
                onChange={(e) => setAsyncJob(e.target.checked)}
                className="rounded border-[var(--border)]"
              />
              Async job (poll until complete)
            </label>

            <button
              type="button"
              disabled={busy}
              onClick={() => void runScrape()}
              className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-md bg-[var(--accent)] px-4 py-2.5 font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-wider text-black transition hover:brightness-110 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-deep)]"
            >
              {busy ? (
                <>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-black/80 animate-pulse"
                    aria-hidden
                  />
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Working…
                </>
              ) : (
                "Run scrape"
              )}
            </button>
          </div>
        </ConsolePanel>

        <section className="panel-reveal panel-reveal-delay-1 space-y-3">
          {httpStatus != null && (
            <p className="font-mono text-xs text-[var(--muted)]">
              HTTP{" "}
              <span
                className={
                  httpStatus >= 200 && httpStatus < 300
                    ? "text-[var(--status-ok)]"
                    : httpStatus >= 400
                      ? "text-[var(--status-err)]"
                      : "text-[var(--text)]"
                }
              >
                {httpStatus}
              </span>
            </p>
          )}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
          <ResponseViewer data={result} loading={busy && !result} />
        </section>
      </div>

      <div className="panel-reveal panel-reveal-delay-2 space-y-4 lg:sticky lg:top-24 lg:self-start">
        <UsageMock />
      </div>
    </div>
  );
}
