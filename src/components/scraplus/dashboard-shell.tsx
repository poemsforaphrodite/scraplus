"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import {
  Command,
  Layers,
  LayoutGrid,
  Menu,
  Moon,
  Network,
  Radar,
  Scissors,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { clsx } from "clsx";
import { CommandMenu } from "@/components/scraplus/command-menu";
import { DASHBOARD_NAV_ITEMS, pageTitleForPath } from "@/lib/dashboard-nav";

const ICONS = {
  "/scrape": Scissors,
  "/batch": Layers,
  "/crawl": Network,
  "/schedules": LayoutGrid,
  "/monitors": Radar,
} as const;

const NAV = DASHBOARD_NAV_ITEMS.map((item, i) => ({
  ...item,
  icon: ICONS[item.href],
  hint: String(i + 1),
}));

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { setTheme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const { contextLine, title } = pageTitleForPath(pathname);

  useEffect(() => {
    startTransition(() => {
      setMounted(true);
    });
  }, []);

  return (
    <div className="flex min-h-0 flex-1 bg-[var(--bg-deep)] text-[var(--text)]">
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />

      {/* Mobile overlay */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)] transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-4">
          <Link
            href="/scrape"
            className="font-[family-name:var(--font-mono)] text-xs font-medium uppercase tracking-[0.2em] text-[var(--text)]"
            onClick={() => setOpen(false)}
          >
            Scraplus
          </Link>
          <button
            type="button"
            className="rounded-md p-2 md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close sidebar"
          >
            <Menu className="h-4 w-4 rotate-90" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV.map(({ href, label, icon: Icon, soon, hint }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={clsx(
                  "relative flex items-center gap-2 rounded-md px-3 py-2 pl-[11px] font-[family-name:var(--font-mono)] text-[11px] font-medium uppercase tracking-wider transition-colors",
                  active &&
                    !soon &&
                    "bg-[var(--surface-active)] text-[var(--text)] shadow-[inset_3px_0_0_0_var(--accent)]",
                  !active &&
                    !soon &&
                    "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]",
                  soon && "opacity-50",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
                {soon ? (
                  <span className="ml-auto text-[10px] normal-case opacity-70">
                    soon
                  </span>
                ) : (
                  <span
                    className="ml-auto hidden font-mono text-[10px] tabular-nums text-[var(--muted)] md:inline"
                    aria-hidden
                  >
                    {hint}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[var(--border)] p-3">
          <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
            Scraplus v0.1
          </p>
          <p className="mt-2 font-[family-name:var(--font-mono)] text-[9px] leading-relaxed text-[var(--muted)]">
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg-deep)] px-1 py-px">
              ⌘K
            </kbd>{" "}
            palette ·{" "}
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg-deep)] px-1 py-px">
              /
            </kbd>{" "}
            search
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-deep)]/85 px-4 py-3 backdrop-blur-md">
          <button
            type="button"
            className="rounded-md p-2 md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">
              {contextLine}
            </p>
            <h1 className="truncate text-sm font-semibold text-[var(--text)]">
              {title}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="hidden items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wider text-[var(--muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--text)] sm:flex"
            aria-label="Open command menu"
          >
            <Command className="h-3.5 w-3.5" />
            <span className="text-[var(--text)]">Palette</span>
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg-deep)] px-1 py-px text-[9px]">
              ⌘K
            </kbd>
          </button>
          {mounted && (
            <button
              type="button"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--text)] transition hover:border-[var(--accent)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          )}
        </header>
        <div className="grain relative flex-1 overflow-auto">
          <div className="relative z-[1] mx-auto max-w-6xl px-4 py-8 md:px-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
