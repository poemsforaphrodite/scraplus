export const DASHBOARD_NAV_ITEMS = [
  { href: "/scrape", label: "Scrape", soon: false },
  { href: "/batch", label: "Batch", soon: false },
  { href: "/crawl", label: "Crawl", soon: false },
  { href: "/extract", label: "Extract", soon: false },
  { href: "/map", label: "Map", soon: false },
  { href: "/schedules", label: "Schedules", soon: false },
  { href: "/monitors", label: "Monitors", soon: false },
] as const;

export type DashboardNavHref = (typeof DASHBOARD_NAV_ITEMS)[number]["href"];

export function pageTitleForPath(pathname: string): {
  contextLine: string;
  title: string;
} {
  const segment = pathname.replace(/^\//, "").split("/")[0] || "scrape";
  const map: Record<string, string> = {
    scrape: "Scrape playground",
    batch: "Batch manager",
    crawl: "Recursive crawl",
    extract: "Extract playground",
    map: "Map explorer",
    schedules: "Schedules",
    monitors: "Monitors",
  };
  const title = map[segment] ?? "Workspace";
  return {
    contextLine: `scraplus / ${segment}`,
    title,
  };
}
