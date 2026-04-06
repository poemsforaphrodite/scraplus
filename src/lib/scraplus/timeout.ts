/** Scrape timeout: default 15s, max 60s, min 3s (aligned with Modal gateway). */
export function clampScrapeTimeout(timeout: unknown): number {
  const n = Number(timeout);
  const v = Number.isFinite(n) ? n : 15;
  return Math.min(60, Math.max(3, v));
}
