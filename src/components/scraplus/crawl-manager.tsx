"use client";

import { useCallback, useState } from "react";
import { Loader2, OctagonX } from "lucide-react";
import { useToast } from "@/components/scraplus/toast";
import { UsageMock } from "@/components/scraplus/usage-mock";
import { ConsolePanel } from "@/components/scraplus/console-panel";
import { SegmentedControl } from "@/components/scraplus/segmented-control";

type CrawlRow = {
  url?: string;
  ok?: boolean;
  depth?: number;
  result?: Record<string, unknown>;
  error?: string;
};

type CrawlPoll = {
  status?: string;
  progress?: number;
  completed?: number;
  data?: CrawlRow[];
  errors?: { url?: string; error?: string }[];
  next?: number | null;
};

const MODES = ["auto", "html", "js"] as const;

export function CrawlManager() {
  const toast = useToast();
  const [seedUrl, setSeedUrl] = useState("https://example.com");
  const [limit, setLimit] = useState(20);
  const [maxDepth, setMaxDepth] = useState<number | "">("");
  const [mode, setMode] = useState<(typeof MODES)[number]>("html");
  const [timeoutSec, setTimeoutSec] = useState(15);
  const [robots, setRobots] = useState<"ignore" | "honor">("ignore");
  const [crawlId, setCrawlId] = useState<string | null>(null);
  const [state, setState] = useState<CrawlPoll | null>(null);
  const [loading, setLoading] = useState(false);

  const pollCrawl = useCallback(
    async (id: string) => {
      const deadline = Date.now() + 600_000;
      while (Date.now() < deadline) {
        const r = await fetch(
          `/api/v1/crawl/${encodeURIComponent(id)}?skip=0&page_limit=500`,
        );
        const d = (await r.json().catch(() => ({}))) as CrawlPoll & {
          error?: string;
        };
        if (!r.ok) {
          toast(typeof d.error === "string" ? d.error : "Poll failed", "error");
          return;
        }
        const er = await fetch(
          `/api/v1/crawl/${encodeURIComponent(id)}/errors`,
        );
        const ed = (await er.json().catch(() => ({}))) as {
          errors?: { url?: string; error?: string }[];
        };
        const errors = er.ok && Array.isArray(ed.errors) ? ed.errors : [];
        setState({
          ...d,
          errors,
        });
        if (d.status === "completed" || d.status === "cancelled") {
          toast(
            d.status === "cancelled" ? "Crawl cancelled" : "Crawl completed",
            d.status === "cancelled" ? "info" : "success",
          );
          return;
        }
        await new Promise((x) => setTimeout(x, 1500));
      }
      toast("Crawl poll timeout", "error");
    },
    [toast],
  );

  const submitCrawl = async () => {
    const u = seedUrl.trim();
    if (!u) {
      toast("Enter a seed URL", "error");
      return;
    }
    setLoading(true);
    setState(null);
    setCrawlId(null);
    try {
      const body: Record<string, unknown> = {
        url: u,
        limit,
        robots_policy: robots,
        scrape_options: {
          mode,
          timeout: timeoutSec,
          formats: ["markdown", "text", "html"],
        },
      };
      if (maxDepth !== "" && typeof maxDepth === "number") {
        body.max_discovery_depth = maxDepth;
      }
      const res = await fetch("/api/v1/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        crawl_id?: string;
        error?: string;
      };
      if (!res.ok) {
        toast(data.error ?? `Crawl failed (${res.status})`, "error");
        return;
      }
      if (typeof data.crawl_id !== "string") {
        toast("Invalid crawl response", "error");
        return;
      }
      setCrawlId(data.crawl_id);
      toast("Crawl queued", "success");
      await pollCrawl(data.crawl_id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Crawl error", "error");
    } finally {
      setLoading(false);
    }
  };

  const cancelCrawl = async () => {
    if (!crawlId) return;
    try {
      const res = await fetch(
        `/api/v1/crawl/${encodeURIComponent(crawlId)}/cancel`,
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

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-6">
        <ConsolePanel
          className="panel-reveal"
          overline="POST /api/v1/crawl"
          title="Recursive crawl"
          description="Discovers links from the seed URL (and optional sitemap), with SSRF guards. Chained Modal steps."
        >
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
                Seed URL
              </span>
              <input
                value={seedUrl}
                onChange={(e) => setSeedUrl(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block space-y-1.5">
                <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
                  Page limit
                </span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={limit}
                  onChange={(e) =>
                    setLimit(Math.min(500, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
                  Max depth
                </span>
                <input
                  type="number"
                  min={0}
                  placeholder="∞"
                  value={maxDepth}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMaxDepth(v === "" ? "" : Math.max(0, Number(v) || 0));
                  }}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm"
                />
              </label>
              <div className="space-y-1.5">
                <span className="block font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
                  robots.txt
                </span>
                <SegmentedControl
                  ariaLabel="Robots.txt policy"
                  value={robots}
                  onChange={setRobots}
                  options={
                    [
                      { value: "ignore", label: "ignore" },
                      { value: "honor", label: "honor" },
                    ] as const
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="block font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
                  Scrape mode
                </span>
                <SegmentedControl
                  ariaLabel="Crawl scrape mode"
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
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void submitCrawl()}
                className="flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-black transition hover:brightness-110 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-deep)]"
              >
                {loading ? (
                  <>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-black/80 animate-pulse"
                      aria-hidden
                    />
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running…
                  </>
                ) : (
                  "Start crawl"
                )}
              </button>
              {crawlId && (
                <button
                  type="button"
                  onClick={() => void cancelCrawl()}
                  className="flex items-center gap-2 rounded-md border border-amber-500/40 px-4 py-2 font-mono text-xs uppercase tracking-wider text-amber-200 transition hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  <OctagonX className="h-4 w-4" />
                  Cancel
                </button>
              )}
            </div>
          </div>
        </ConsolePanel>

        {state && (
          <section className="panel-reveal panel-reveal-delay-1 space-y-3">
            <p className="font-mono text-xs text-[var(--muted)]">
              Status:{" "}
              <span className="text-[var(--text)]">{state.status ?? "—"}</span>
              {typeof state.completed === "number" && (
                <span className="text-[var(--muted)]">
                  {" "}
                  ({state.completed} pages)
                </span>
              )}
            </p>
            <div className="max-h-[28rem] overflow-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-[var(--border)] bg-black/40 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2">URL</th>
                    <th className="px-3 py-2">Depth</th>
                  </tr>
                </thead>
                <tbody>
                  {(state.data ?? []).map((row, i) => (
                    <tr key={`${i}-${row.url}`} className="border-t border-[var(--border)]/80">
                      <td className="max-w-md truncate px-3 py-2 font-mono text-xs text-[var(--accent-dim)]">
                        {row.url}
                      </td>
                      <td className="px-3 py-2 text-[var(--muted)]">
                        {row.depth ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(state.errors ?? []).length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-3">
                <p className="font-mono text-[10px] uppercase text-red-300">
                  Errors ({state.errors!.length})
                </p>
                <ul className="mt-2 max-h-40 list-inside list-disc overflow-auto text-xs text-red-200/90">
                  {state.errors!.map((e, i) => (
                    <li key={i}>
                      {e.url}: {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
      <div className="panel-reveal panel-reveal-delay-2 lg:sticky lg:top-24 lg:self-start">
        <UsageMock />
      </div>
    </div>
  );
}
