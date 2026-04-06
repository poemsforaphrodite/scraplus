import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DashboardShell from "./dashboard-shell";

afterEach(() => {
  cleanup();
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/scrape",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "dark",
    setTheme: vi.fn(),
    resolvedTheme: "dark",
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("DashboardShell", () => {
  it("renders Scraplus brand and context from path", () => {
    render(
      <DashboardShell>
        <p>child</p>
      </DashboardShell>,
    );
    expect(screen.getAllByText("Scraplus").length).toBeGreaterThan(0);
    expect(screen.getByText("child")).toBeDefined();
    expect(screen.getByText("scraplus / scrape")).toBeDefined();
    expect(screen.getByText("Scrape playground")).toBeDefined();
  });

  it("opens command palette from ⌘K shortcut", () => {
    render(
      <DashboardShell>
        <p>child</p>
      </DashboardShell>,
    );
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const inputs = screen.getAllByPlaceholderText(
      /type a command or search/i,
    );
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });
});
