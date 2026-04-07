"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { ExternalLink, Loader2 } from "lucide-react";
import { useToast } from "@/components/scraplus/toast";
import { ConsolePanel } from "@/components/scraplus/console-panel";

export function MapExplorer() {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [limit, setLimit] = useState(100);
  const [ignoreSitemap, setIgnoreSitemap] = useState(false);
  const [includeSubdomains, setIncludeSubdomains] = useState(true);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const runMap = async () => {
    if (!url.trim()) return toast("Enter a URL", "error");
    setLoading(true);
    setLinks([]);
    setSelected(new Set());
    try {
      const res = await fetch("/api/v1/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          limit,
          ignoreSitemap,
          includeSubdomains,
          search: search.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { links?: string[]; error?: string };
      if (!res.ok) {
        toast(data.error ?? "Map failed", "error");
        return;
      }
      setLinks(data.links || []);
      toast(`Found ${(data.links || []).length} URLs`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (u: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === links.length) setSelected(new Set());
    else setSelected(new Set(links));
  };

  const scrapeSelected = async () => {
    const urls = Array.from(selected);
    if (urls.length === 0) return toast("Select URLs to scrape", "error");
    try {
      const res = await fetch("/api/v1/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, formats: ["markdown", "text"] }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        toast(data.error ?? "Batch creation failed", "error");
        return;
      }
      toast(`Batch started: ${data.id}`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    }
  };

  return (
    <div className="space-y-6">
      <ConsolePanel
        className="panel-reveal"
        overline="Map"
        title="URL discovery"
        description="Discover all URLs from a website via sitemaps and link extraction, without scraping content."
      >
        <div className="space-y-4">
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

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                Limit
              </span>
              <input
                type="number"
                min={1}
                max={30000}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 100)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                Filter (search)
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                placeholder="blog"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 font-mono text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={ignoreSitemap}
                onChange={(e) => setIgnoreSitemap(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Ignore sitemap
            </label>
            <label className="flex items-center gap-2 font-mono text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={includeSubdomains}
                onChange={(e) => setIncludeSubdomains(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Include subdomains
            </label>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void runMap()}
            className="flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-black transition hover:brightness-110 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Discover URLs
          </button>
        </div>
      </ConsolePanel>

      {links.length > 0 && (
        <ConsolePanel
          overline="Results"
          title={`${links.length} URLs found`}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={selectAll}
                className="font-mono text-[10px] uppercase text-[var(--accent-dim)] hover:text-[var(--accent)]"
              >
                {selected.size === links.length ? "Deselect all" : "Select all"}
              </button>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => void scrapeSelected()}
                  className="rounded-md bg-[var(--accent)]/80 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-black hover:bg-[var(--accent)]"
                >
                  Scrape selected ({selected.size})
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-deep)]">
              {links.map((link, i) => (
                <label
                  key={i}
                  className={clsx(
                    "flex cursor-pointer items-center gap-2 border-b border-[var(--border)]/30 px-3 py-1.5 text-xs transition last:border-0",
                    selected.has(link) && "bg-[var(--accent)]/5",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(link)}
                    onChange={() => toggleSelect(link)}
                    className="accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-[var(--text)]">
                    {link}
                  </span>
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[var(--muted)] hover:text-[var(--accent)]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </label>
              ))}
            </div>
          </div>
        </ConsolePanel>
      )}
    </div>
  );
}
