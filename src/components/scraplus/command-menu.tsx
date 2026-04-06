"use client";

import { DialogTitle } from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { DASHBOARD_NAV_ITEMS } from "@/lib/dashboard-nav";

function typingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable=true]"),
  );
}

export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();

  const closeThen = useCallback(
    (fn: () => void) => {
      onOpenChange(false);
      fn();
    },
    [onOpenChange],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
        return;
      }
      if (e.key === "/" && !open && !typingInField(e.target)) {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const contentClassName =
    "fixed left-1/2 top-[12vh] z-[101] w-[min(100vw-2rem,520px)] -translate-x-1/2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] shadow-[var(--panel-glow)] " +
    "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:font-[family-name:var(--font-mono)] " +
    "[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider " +
    "[&_[cmdk-group-heading]]:text-[var(--muted)] [&_[cmdk-label]]:sr-only";

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command menu"
      shouldFilter
      vimBindings
      overlayClassName="fixed inset-0 z-[100] bg-black/50 backdrop-blur-[2px]"
      contentClassName={contentClassName}
    >
      <DialogTitle className="sr-only">Command menu</DialogTitle>
      <Command.Input
        placeholder="Type a command or search…"
        className="w-full border-b border-[var(--border)] bg-[var(--bg-deep)] px-4 py-3 font-[family-name:var(--font-mono)] text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"
      />
      <Command.List className="max-h-[min(50vh,360px)] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center font-[family-name:var(--font-mono)] text-xs text-[var(--muted)]">
          No matches.
        </Command.Empty>

        <Command.Group heading="Navigate">
          {DASHBOARD_NAV_ITEMS.map((item) => (
            <Command.Item
              key={item.href}
              value={`${item.label} ${item.href}`}
              disabled={item.soon}
              onSelect={() => {
                if (item.soon) return;
                closeThen(() => router.push(item.href));
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 font-[family-name:var(--font-mono)] text-xs text-[var(--text)] aria-selected:bg-[var(--surface-active)] data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
            >
              {item.label}
              {item.soon ? (
                <span className="ml-auto text-[10px] text-[var(--muted)]">
                  soon
                </span>
              ) : (
                <kbd className="ml-auto hidden rounded border border-[var(--border)] bg-[var(--bg-deep)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)] sm:inline">
                  {item.href}
                </kbd>
              )}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Separator className="my-2 h-px bg-[var(--border)]" />

        <Command.Group heading="Appearance">
          <Command.Item
            value="theme toggle dark light"
            onSelect={() =>
              closeThen(() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark"),
              )
            }
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 font-[family-name:var(--font-mono)] text-xs text-[var(--text)] aria-selected:bg-[var(--surface-active)]"
          >
            Toggle theme
            <kbd className="ml-auto hidden rounded border border-[var(--border)] bg-[var(--bg-deep)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)] sm:inline">
              {resolvedTheme === "dark" ? "→ light" : "→ dark"}
            </kbd>
          </Command.Item>
        </Command.Group>
      </Command.List>
      <p className="border-t border-[var(--border)] px-4 py-2 font-[family-name:var(--font-mono)] text-[10px] text-[var(--muted)]">
        <kbd className="rounded border border-[var(--border)] bg-[var(--bg-deep)] px-1">
          esc
        </kbd>{" "}
        close ·{" "}
        <kbd className="rounded border border-[var(--border)] bg-[var(--bg-deep)] px-1">
          /
        </kbd>{" "}
        open
      </p>
    </Command.Dialog>
  );
}
