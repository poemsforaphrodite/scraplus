import { describe, expect, it } from "vitest";
import { clampScrapeTimeout } from "./timeout";

describe("clampScrapeTimeout", () => {
  it("defaults to 15", () => {
    expect(clampScrapeTimeout(undefined)).toBe(15);
    expect(clampScrapeTimeout("x")).toBe(15);
  });
  it("clamps min 3 max 60", () => {
    expect(clampScrapeTimeout(1)).toBe(3);
    expect(clampScrapeTimeout(120)).toBe(60);
    expect(clampScrapeTimeout(30)).toBe(30);
  });
});
