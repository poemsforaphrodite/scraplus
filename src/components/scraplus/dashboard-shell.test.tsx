import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardShell from "./dashboard-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/scrape",
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
  it("renders Scraplus brand", () => {
    render(
      <DashboardShell>
        <p>child</p>
      </DashboardShell>,
    );
    expect(screen.getAllByText("Scraplus").length).toBeGreaterThan(0);
    expect(screen.getByText("child")).toBeDefined();
  });
});
