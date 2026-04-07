"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/scraplus/toast";
import { ConsolePanel } from "@/components/scraplus/console-panel";
import { ResponseViewer } from "@/components/scraplus/response-viewer";

type Tab = "css" | "llm";

export function ExtractPlayground() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("css");
  const [url, setUrl] = useState("");
  const [selectors, setSelectors] = useState<{ key: string; value: string }[]>([
    { key: "title", value: "h1" },
  ]);
  const [prompt, setPrompt] = useState("");
  const [schema, setSchema] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const addSelector = () =>
    setSelectors((s) => [...s, { key: "", value: "" }]);

  const removeSelector = (i: number) =>
    setSelectors((s) => s.filter((_, idx) => idx !== i));

  const updateSelector = (i: number, field: "key" | "value", val: string) =>
    setSelectors((s) =>
      s.map((item, idx) => (idx === i ? { ...item, [field]: val } : item)),
    );

  const runCssExtract = async () => {
    if (!url.trim()) return toast("Enter a URL", "error");
    const selectorMap: Record<string, string> = {};
    for (const s of selectors) {
      if (s.key.trim() && s.value.trim()) {
        selectorMap[s.key.trim()] = s.value.trim();
      }
    }
    if (!Object.keys(selectorMap).length) {
      return toast("Add at least one selector", "error");
    }
    setLoading(true);
    setResult(null);
    try {
      let parsedSchema: Record<string, unknown> | undefined;
      if (schema.trim()) {
        try {
          parsedSchema = JSON.parse(schema);
        } catch {
          return toast("Invalid JSON schema", "error");
        }
      }
      const res = await fetch("/api/v1/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          selectors: selectorMap,
          schema: parsedSchema,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error ?? "Extraction failed", "error");
        return;
      }
      setResult(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setLoading(false);
    }
  };

  const runLlmExtract = async () => {
    if (!url.trim()) return toast("Enter a URL", "error");
    if (!prompt.trim()) return toast("Enter a prompt", "error");
    setLoading(true);
    setResult(null);
    try {
      let parsedSchema: Record<string, unknown> | undefined;
      if (schema.trim()) {
        try {
          parsedSchema = JSON.parse(schema);
        } catch {
          return toast("Invalid JSON schema", "error");
        }
      }
      const res = await fetch("/api/v1/extract/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          prompt: prompt.trim(),
          schema: parsedSchema,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error ?? "LLM extraction failed", "error");
        return;
      }
      setResult(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <ConsolePanel
        className="panel-reveal"
        overline="Extract"
        title="Data extraction"
        description="Extract structured data using CSS selectors or natural language prompts (LLM)."
      >
        <div className="space-y-4">
          <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] p-1">
            {(["css", "llm"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={clsx(
                  "flex-1 rounded-md px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition",
                  tab === t
                    ? "bg-[var(--accent)] text-black"
                    : "text-[var(--muted)] hover:text-[var(--text)]",
                )}
              >
                {t === "css" ? "CSS Selectors" : "LLM Extract"}
              </button>
            ))}
          </div>

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

          {tab === "css" ? (
            <div className="space-y-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                Selectors
              </span>
              {selectors.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={s.key}
                    onChange={(e) => updateSelector(i, "key", e.target.value)}
                    placeholder="field name"
                    className="w-1/3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  />
                  <input
                    value={s.value}
                    onChange={(e) => updateSelector(i, "value", e.target.value)}
                    placeholder="CSS selector"
                    className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  />
                  <button
                    type="button"
                    onClick={() => removeSelector(i)}
                    className="shrink-0 rounded-md px-2 font-mono text-xs text-[var(--muted)] hover:text-red-400"
                    disabled={selectors.length <= 1}
                  >
                    x
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addSelector}
                className="font-mono text-xs text-[var(--accent-dim)] hover:text-[var(--accent)]"
              >
                + Add selector
              </button>
            </div>
          ) : (
            <label className="block space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                Prompt
              </span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                placeholder="Extract the product name, price, and rating..."
              />
            </label>
          )}

          <label className="block space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
              JSON Schema (optional)
            </span>
            <textarea
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              placeholder='{"type":"object","properties":{"name":{"type":"string"}}}'
            />
          </label>

          <button
            type="button"
            disabled={loading}
            onClick={() => void (tab === "css" ? runCssExtract() : runLlmExtract())}
            className="flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-black transition hover:brightness-110 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Extract
          </button>
        </div>
      </ConsolePanel>

      {result && (
        <ConsolePanel overline="Result" title="Extraction result">
          <ResponseViewer data={result} loading={false} />
        </ConsolePanel>
      )}
    </div>
  );
}
