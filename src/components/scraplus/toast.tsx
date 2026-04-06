"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { CheckCircle2, X } from "lucide-react";
import { clsx } from "clsx";

type Toast = {
  id: string;
  message: string;
  kind: "success" | "error" | "info";
};

const ToastCtx = createContext<{
  show: (message: string, kind?: Toast["kind"]) => void;
} | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast requires ToastProvider");
  return ctx.show;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const show = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = crypto.randomUUID();
    setItems((t) => [...t, { id, message, kind }]);
    window.setTimeout(() => {
      setItems((t) => t.filter((x) => x.id !== id));
    }, 4800);
  }, []);

  const dismiss = (id: string) =>
    setItems((t) => t.filter((x) => x.id !== id));

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex max-w-sm flex-col gap-2"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur-sm",
              t.kind === "success" &&
                "border-emerald-500/30 bg-emerald-950/90 text-emerald-100",
              t.kind === "error" &&
                "border-red-500/30 bg-red-950/90 text-red-100",
              t.kind === "info" &&
                "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text)]",
            )}
          >
            {t.kind === "success" && (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            )}
            <p className="flex-1 leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded p-0.5 opacity-70 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
