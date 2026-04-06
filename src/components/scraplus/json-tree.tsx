"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

function Row({
  k,
  v,
  depth,
}: {
  k?: string;
  v: unknown;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);

  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>);
    return (
      <div className="font-mono text-xs">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={clsx(
            "flex w-full items-center gap-0.5 rounded px-1 py-0.5 text-left hover:bg-white/5",
          )}
          style={{ paddingLeft: 4 + depth * 12 }}
        >
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
          )}
          {k != null && <span className="text-[var(--accent-dim)]">{k}: </span>}
          <span className="text-[var(--muted)]">{"{…}"}</span>
        </button>
        {open &&
          entries.map(([ck, cv]) => (
            <Row key={ck} k={ck} v={cv} depth={depth + 1} />
          ))}
      </div>
    );
  } 
  if (Array.isArray(v)) {
    return (
      <div className="font-mono text-xs">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-0.5 rounded px-1 py-0.5 text-left hover:bg-white/5"
          style={{ paddingLeft: 4 + depth * 12 }}
        >
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
          )}
          {k != null && <span className="text-[var(--accent-dim)]">{k}: </span>}
          <span className="text-[var(--muted)]">[{v.length}]</span>
        </button>
        {open &&
          v.map((item, i) => (
            <Row key={i} k={`${i}`} v={item} depth={depth + 1} />
          ))}
      </div>
    );
  }

  const lit =
    v === null
      ? "null"
      : typeof v === "string"
        ? JSON.stringify(v)
        : String(v);

  return (
    <div
      className="break-all py-0.5 font-mono text-xs text-[var(--text)]"
      style={{ paddingLeft: 4 + depth * 12 }}
    >
      {k != null && (
        <span className="text-[var(--accent-dim)]">{k}: </span>
      )}
      <span
        className={
          typeof v === "string" ? "text-emerald-300/90" : "text-amber-200/90"
        }
      >
        {lit}
      </span>
    </div>
  );
}

export function JsonTree({ data }: { data: unknown }) {
  return (
    <div className="max-h-[min(70vh,560px)] overflow-auto rounded-lg border border-[var(--border)] bg-black/20 p-3">
      <Row v={data} depth={0} />
    </div>
  );
}
