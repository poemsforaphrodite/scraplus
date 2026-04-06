"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { clsx } from "clsx";
import { Copy } from "lucide-react";
import { JsonTree } from "@/components/scraplus/json-tree";
import { useToast } from "@/components/scraplus/toast";

type Tab = "markdown" | "json" | "raw";

function pickMarkdown(data: Record<string, unknown> | null): string {
  if (!data) return "";
  const content = data.content;
  if (content && typeof content === "object" && "markdown" in content) {
    const m = (content as { markdown?: string }).markdown;
    if (typeof m === "string") return m;
  }
  return "";
}

function pickJsonTree(data: Record<string, unknown> | null): unknown {
  return data ?? {};
}

function pickRaw(data: Record<string, unknown> | null): string {
  if (!data) return "";
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function ResponseViewer({
  data,
  loading,
}: {
  data: Record<string, unknown> | null;
  loading: boolean;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("markdown");

  const md = useMemo(() => pickMarkdown(data), [data]);
  const raw = useMemo(() => pickRaw(data), [data]);

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`Copied ${label}`, "success");
    } catch {
      toast("Copy failed", "error");
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "markdown", label: "Markdown" },
    { id: "json", label: "JSON tree" },
    { id: "raw", label: "Raw" },
  ];

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-9 animate-pulse rounded-lg bg-white/5" />
        <div className="h-48 animate-pulse rounded-xl bg-white/5" />
        <div className="h-32 animate-pulse rounded-xl bg-white/5" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/50 px-6 py-16 text-center text-sm text-[var(--muted)]">
        Run a scrape to see output here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={clsx(
              "rounded-md px-3 py-1.5 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider",
              tab === t.id
                ? "bg-[var(--surface-active)] text-[var(--text)]"
                : "text-[var(--muted)] hover:bg-white/5",
            )}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          {tab === "markdown" && (
            <button
              type="button"
              onClick={() => copyText(md, "markdown")}
              className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
            >
              <Copy className="h-3 w-3" />
              Copy
            </button>
          )}
          {tab === "json" && (
            <button
              type="button"
              onClick={() => copyText(raw, "JSON")}
              className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
            >
              <Copy className="h-3 w-3" />
              Copy
            </button>
          )}
          {tab === "raw" && (
            <button
              type="button"
              onClick={() => copyText(raw, "raw")}
              className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
            >
              <Copy className="h-3 w-3" />
              Copy
            </button>
          )}
        </div>
      </div>

      {tab === "markdown" && (
        <article className="prose prose-invert prose-sm max-w-none rounded-xl border border-[var(--border)] bg-black/25 p-4 prose-headings:text-[var(--text)] prose-p:text-zinc-300 prose-a:text-[var(--accent)] prose-code:text-emerald-300">
          {md ? (
            <ReactMarkdown>{md}</ReactMarkdown>
          ) : (
            <p className="text-[var(--muted)]">No markdown in response.</p>
          )}
        </article>
      )}

      {tab === "json" && <JsonTree data={pickJsonTree(data)} />}

      {tab === "raw" && (
        <pre className="max-h-[min(70vh,560px)] overflow-auto rounded-xl border border-[var(--border)] bg-black/35 p-4 font-[family-name:var(--font-mono)] text-xs text-zinc-200">
          {raw}
        </pre>
      )}
    </div>
  );
}
