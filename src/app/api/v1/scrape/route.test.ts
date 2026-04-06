import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/v1/scrape", () => {
  const orig = { ...process.env };

  beforeEach(() => {
    process.env.SCRAPLUS_MODAL_BASE_URL = "https://modal.test";
    process.env.SCRAPLUS_PROXY_SECRET = "secret";
  });

  afterEach(() => {
    process.env = { ...orig };
    vi.unstubAllGlobals();
  });

  it("returns 400 for private URL", async () => {
    const req = new Request("http://localhost/api/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://192.168.1.1/" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 503 when Modal env missing", async () => {
    delete process.env.SCRAPLUS_MODAL_BASE_URL;
    const req = new Request("http://localhost/api/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it("proxies successful Modal response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ url: "https://example.com", ok: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const req = new Request("http://localhost/api/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", mode: "html" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: number };
    expect(body.ok).toBe(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "https://modal.test/scrape",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});
