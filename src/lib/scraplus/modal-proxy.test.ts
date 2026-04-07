import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getModalConfig, modalRequest } from "./modal-proxy";

describe("getModalConfig", () => {
  const orig = { ...process.env };

  afterEach(() => {
    process.env = { ...orig };
  });

  it("throws when SCRAPLUS_MODAL_BASE_URL is missing", () => {
    delete process.env.SCRAPLUS_MODAL_BASE_URL;
    process.env.SCRAPLUS_PROXY_SECRET = "s";
    expect(() => getModalConfig()).toThrow("SCRAPLUS_MODAL_BASE_URL");
  });

  it("throws when SCRAPLUS_PROXY_SECRET is missing", () => {
    process.env.SCRAPLUS_MODAL_BASE_URL = "https://modal.test";
    delete process.env.SCRAPLUS_PROXY_SECRET;
    expect(() => getModalConfig()).toThrow("SCRAPLUS_PROXY_SECRET");
  });

  it("returns config with trailing slash stripped", () => {
    process.env.SCRAPLUS_MODAL_BASE_URL = "https://modal.test/";
    process.env.SCRAPLUS_PROXY_SECRET = "sec";
    const cfg = getModalConfig();
    expect(cfg.baseUrl).toBe("https://modal.test");
    expect(cfg.secret).toBe("sec");
  });
});

describe("modalRequest", () => {
  const orig = { ...process.env };

  beforeEach(() => {
    process.env.SCRAPLUS_MODAL_BASE_URL = "https://modal.test";
    process.env.SCRAPLUS_PROXY_SECRET = "secret123";
  });

  afterEach(() => {
    process.env = { ...orig };
    vi.unstubAllGlobals();
  });

  it("builds correct URL and sets secret header", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", mockFetch);

    await modalRequest("/scrape", { method: "POST", body: '{"url":"x"}' });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://modal.test/scrape",
      expect.objectContaining({ method: "POST" }),
    );
    const headers = mockFetch.mock.calls[0][1].headers as Headers;
    expect(headers.get("X-Scraplus-Secret")).toBe("secret123");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("prepends slash if missing from path", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", mockFetch);

    await modalRequest("batch", { method: "POST", body: '{}' });

    expect(mockFetch.mock.calls[0][0]).toBe("https://modal.test/batch");
  });
});
