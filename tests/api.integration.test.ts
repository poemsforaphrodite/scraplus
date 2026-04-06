import { describe, expect, it, beforeAll } from "vitest";

const BASE = process.env.INTEGRATION_BASE_URL || "http://127.0.0.1:3999";
const SCRAPE_URL = "https://example.com";
const SCRAPE_URL_2 = "https://httpbin.org/html";

async function api(path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init.headers },
    ...init,
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function post(path: string, json: Record<string, unknown>) {
  return api(path, { method: "POST", body: JSON.stringify(json) });
}

function get(path: string) {
  return api(path, { method: "GET" });
}

describe("Integration Tests — Scraplus API → Modal Backend", () => {
  // ─── SCRAPE ───────────────────────────────────────────────────────────────
  describe("POST /api/v1/scrape", () => {
    it("scrapes a real page (markdown mode)", async () => {
      const { status, body } = await post("/api/v1/scrape", {
        url: SCRAPE_URL,
        formats: ["markdown"],
      });
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      const content = b.content as Record<string, string>;
      expect(content).toHaveProperty("markdown");
      expect(content.markdown.length).toBeGreaterThan(0);
    });

    it("scrapes a real page (html mode)", async () => {
      const { status, body } = await post("/api/v1/scrape", {
        url: SCRAPE_URL,
        mode: "html",
        formats: ["html"],
      });
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      const content = b.content as Record<string, string>;
      expect(content).toHaveProperty("html");
      expect(content.html).toContain("<");
    });

    it("scrapes a real page (text mode)", async () => {
      const { status, body } = await post("/api/v1/scrape", {
        url: SCRAPE_URL,
        formats: ["text"],
      });
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      const content = b.content as Record<string, string>;
      expect(content).toHaveProperty("text");
      expect(content.text.length).toBeGreaterThan(0);
    });

    it("scrapes with json format", async () => {
      const { status, body } = await post("/api/v1/scrape", {
        url: SCRAPE_URL,
        formats: ["json"],
      });
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      const content = b.content as Record<string, unknown>;
      expect(content).toHaveProperty("json");
      // json may be an object or a string depending on the backend
      expect(content.json).toBeDefined();
    });

    it("returns 400 for private IP (SSRF protection)", async () => {
      const { status, body } = await post("/api/v1/scrape", {
        url: "http://192.168.1.1",
      });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toMatch(/Private IP|Blocked/i);
    });

    it("returns 400 for localhost (SSRF protection)", async () => {
      const { status, body } = await post("/api/v1/scrape", {
        url: "http://localhost/secret",
      });
      expect(status).toBe(400);
    });

    it("returns 400 for missing url", async () => {
      const { status, body } = await post("/api/v1/scrape", {});
      expect(status).toBe(400);
      expect((body as { error: string }).error).toMatch(/Missing url/i);
    });

    it("returns 400 for invalid mode", async () => {
      const { status, body } = await post("/api/v1/scrape", {
        url: SCRAPE_URL,
        mode: "foobar",
      });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toMatch(/Invalid mode/i);
    });

    it("returns 400 for invalid format", async () => {
      const { status, body } = await post("/api/v1/scrape", {
        url: SCRAPE_URL,
        formats: ["xml", "csv"],
      });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toMatch(/Unknown formats/i);
    });

    it("returns 400 for invalid JSON body", async () => {
      const res = await fetch(`${BASE}/api/v1/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json{{{",
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for file:// scheme (SSRF)", async () => {
      const { status } = await post("/api/v1/scrape", {
        url: "file:///etc/passwd",
      });
      expect(status).toBe(400);
    });

    it("scrapes with custom headers", async () => {
      const { status, body } = await post("/api/v1/scrape", {
        url: SCRAPE_URL,
        headers: { "Accept-Language": "en-US" },
        formats: ["markdown"],
      });
      expect(status).toBe(200);
      expect((body as Record<string, unknown>).content as Record<string, unknown>).toHaveProperty("markdown");
    });

    it("scrapes with only_main_content", async () => {
      const { status, body } = await post("/api/v1/scrape", {
        url: SCRAPE_URL_2,
        only_main_content: true,
        formats: ["markdown"],
      });
      expect(status).toBe(200);
      expect((body as Record<string, unknown>).content as Record<string, unknown>).toHaveProperty("markdown");
    });

    it("scrapes with custom timeout", async () => {
      const { status, body } = await post("/api/v1/scrape", {
        url: SCRAPE_URL,
        timeout: 30,
        formats: ["text"],
      });
      expect(status).toBe(200);
      expect((body as Record<string, unknown>).content as Record<string, unknown>).toHaveProperty("text");
    });

    it("scrapes with include_tags", async () => {
      const { status, body } = await post("/api/v1/scrape", {
        url: SCRAPE_URL,
        include_tags: ["h1", "p"],
        formats: ["markdown"],
      });
      expect(status).toBe(200);
      expect((body as Record<string, unknown>).content as Record<string, unknown>).toHaveProperty("markdown");
    });

    it("scrapes with exclude_tags", async () => {
      const { status, body } = await post("/api/v1/scrape", {
        url: SCRAPE_URL,
        exclude_tags: ["nav", "footer"],
        formats: ["markdown"],
      });
      expect(status).toBe(200);
      expect((body as Record<string, unknown>).content as Record<string, unknown>).toHaveProperty("markdown");
    });

    it("returns the scraped url in response", async () => {
      const { status, body } = await post("/api/v1/scrape", {
        url: SCRAPE_URL,
        formats: ["markdown"],
      });
      expect(status).toBe(200);
      expect((body as Record<string, unknown>).url).toBe(SCRAPE_URL);
    });
  });

  // ─── BATCH ────────────────────────────────────────────────────────────────
  describe("POST /api/v1/batch", () => {
    it("submits a batch of URLs and gets a batch ID", async () => {
      const { status, body } = await post("/api/v1/batch", {
        urls: [SCRAPE_URL, SCRAPE_URL_2],
        formats: ["markdown"],
      });
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("batch_id");
      expect(typeof b.batch_id).toBe("string");
      expect((b.batch_id as string).length).toBeGreaterThan(0);
    });

    it("returns 400 for empty urls array", async () => {
      const { status, body } = await post("/api/v1/batch", { urls: [] });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toMatch(/non-empty array/i);
    });

    it("returns 400 when urls is not array", async () => {
      const { status, body } = await post("/api/v1/batch", { urls: "https://example.com" });
      expect(status).toBe(400);
    });

    it("returns 400 for private IP in batch urls", async () => {
      const { status, body } = await post("/api/v1/batch", {
        urls: [SCRAPE_URL, "http://10.0.0.1"],
      });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toMatch(/Blocked URL/i);
    });

    it("returns 400 for invalid mode", async () => {
      const { status, body } = await post("/api/v1/batch", {
        urls: [SCRAPE_URL],
        mode: "invalid",
      });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toMatch(/Invalid mode/i);
    });

    it("submits batch with scrape_options", async () => {
      const { status, body } = await post("/api/v1/batch", {
        urls: [SCRAPE_URL],
        scrape_options: { only_main_content: true },
      });
      expect(status).toBe(200);
      expect((body as Record<string, unknown>)).toHaveProperty("batch_id");
    });

    it("submits batch with custom headers", async () => {
      const { status, body } = await post("/api/v1/batch", {
        urls: [SCRAPE_URL],
        headers: { Accept: "text/html" },
      });
      expect(status).toBe(200);
      expect((body as Record<string, unknown>)).toHaveProperty("batch_id");
    });
  });

  describe("GET /api/v1/batch/:id", () => {
    let batchId: string;

    beforeAll(async () => {
      const { body } = await post("/api/v1/batch", {
        urls: [SCRAPE_URL],
        formats: ["text"],
      });
      batchId = (body as { batch_id: string }).batch_id;
    });

    it("polls batch status and returns valid response", async () => {
      const { status, body } = await get(`/api/v1/batch/${batchId}`);
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("status");
    });
  });

  // ─── CRAWL ────────────────────────────────────────────────────────────────
  describe("POST /api/v1/crawl", () => {
    it("starts a crawl and returns a crawl ID", async () => {
      const { status, body } = await post("/api/v1/crawl", {
        url: SCRAPE_URL,
        limit: 5,
      });
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("crawl_id");
      expect(typeof b.crawl_id).toBe("string");
    });

    it("returns 400 for missing url", async () => {
      const { status, body } = await post("/api/v1/crawl", {});
      expect(status).toBe(400);
      expect((body as { error: string }).error).toMatch(/Missing url/i);
    });

    it("returns 400 for private IP (SSRF)", async () => {
      const { status } = await post("/api/v1/crawl", {
        url: "http://172.16.0.1",
      });
      expect(status).toBe(400);
    });

    it("starts crawl with robots_policy", async () => {
      const { status, body } = await post("/api/v1/crawl", {
        url: SCRAPE_URL,
        robots_policy: "obey",
        limit: 3,
      });
      expect(status).toBe(200);
      expect((body as Record<string, unknown>)).toHaveProperty("crawl_id");
    });

    it("starts crawl with path filters", async () => {
      const { status, body } = await post("/api/v1/crawl", {
        url: SCRAPE_URL,
        limit: 2,
        include_paths: ["/"],
        exclude_paths: ["/admin"],
      });
      expect(status).toBe(200);
      expect((body as Record<string, unknown>)).toHaveProperty("crawl_id");
    });

    it("starts crawl with boolean options", async () => {
      const { status, body } = await post("/api/v1/crawl", {
        url: SCRAPE_URL,
        limit: 1,
        regex_on_full_url: true,
        ignore_query_parameters: true,
      });
      expect(status).toBe(200);
      expect((body as Record<string, unknown>)).toHaveProperty("crawl_id");
    });

    it("starts crawl with webhook config", async () => {
      const { status, body } = await post("/api/v1/crawl", {
        url: SCRAPE_URL,
        limit: 1,
        webhook: { url: "https://httpbin.org/post", secret: "test" },
      });
      expect(status).toBe(200);
      expect((body as Record<string, unknown>)).toHaveProperty("crawl_id");
    });

    it("starts crawl with scrape_options", async () => {
      const { status, body } = await post("/api/v1/crawl", {
        url: SCRAPE_URL,
        limit: 1,
        scrape_options: { only_main_content: true },
      });
      expect(status).toBe(200);
      expect((body as Record<string, unknown>)).toHaveProperty("crawl_id");
    });
  });

  describe("GET /api/v1/crawl/:id", () => {
    let crawlId: string;

    beforeAll(async () => {
      const { body } = await post("/api/v1/crawl", {
        url: SCRAPE_URL,
        limit: 1,
      });
      crawlId = (body as { crawl_id: string }).crawl_id;
    });

    it("polls crawl status", async () => {
      const { status, body } = await get(`/api/v1/crawl/${crawlId}`);
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("status");
    });

    it("polls with skip and page_limit params", async () => {
      const { status } = await get(`/api/v1/crawl/${crawlId}?skip=0&page_limit=5`);
      expect(status).toBe(200);
    });
  });

  describe("POST /api/v1/crawl/:id/cancel", () => {
    let crawlId: string;

    beforeAll(async () => {
      const { body } = await post("/api/v1/crawl", {
        url: SCRAPE_URL,
        limit: 100,
      });
      crawlId = (body as { crawl_id: string }).crawl_id;
    });

    it("cancels an in-progress crawl", async () => {
      const { status, body } = await api(`/api/v1/crawl/${crawlId}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect([200, 400, 404]).toContain(status);
      if (status === 200) {
        expect((body as Record<string, unknown>)).toHaveProperty("cancelled");
      }
    });
  });

  describe("GET /api/v1/crawl/:id/errors", () => {
    let crawlId: string;

    beforeAll(async () => {
      const { body } = await post("/api/v1/crawl", {
        url: SCRAPE_URL,
        limit: 1,
      });
      crawlId = (body as { crawl_id: string }).crawl_id;
    });

    it("returns crawl errors (possibly empty)", async () => {
      const { status, body } = await get(`/api/v1/crawl/${crawlId}/errors`);
      expect(status).toBe(200);
      expect(body).toBeDefined();
    });
  });

  // ─── EXTRACT (CSS Selectors) ──────────────────────────────────────────────
  describe("POST /api/v1/extract", () => {
    it("extracts content using CSS selectors", async () => {
      const { status, body } = await post("/api/v1/extract", {
        url: SCRAPE_URL,
        selectors: {
          title: "h1",
          description: "p",
        },
      });
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("success");
      expect(b.success).toBe(true);
      expect(b).toHaveProperty("data");
      expect((b.data as Record<string, unknown>)).toHaveProperty("title");
    });

    it("returns 400 for missing url", async () => {
      const { status, body } = await post("/api/v1/extract", {
        selectors: { title: "h1" },
      });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toMatch(/Missing url/i);
    });

    it("returns 400 for missing selectors", async () => {
      const { status, body } = await post("/api/v1/extract", {
        url: SCRAPE_URL,
      });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toMatch(/selectors/i);
    });

    it("returns 400 for non-object selectors", async () => {
      const { status } = await post("/api/v1/extract", {
        url: SCRAPE_URL,
        selectors: "h1",
      });
      expect(status).toBe(400);
    });

    it("returns 400 for private IP (SSRF)", async () => {
      const { status } = await post("/api/v1/extract", {
        url: "http://127.0.0.1",
        selectors: { title: "h1" },
      });
      expect(status).toBe(400);
    });

    it("extracts with schema", async () => {
      const { status, body } = await post("/api/v1/extract", {
        url: SCRAPE_URL,
        selectors: { title: "h1" },
        schema: { type: "object", properties: { title: { type: "string" } } },
      });
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b.success).toBe(true);
      expect((b.data as Record<string, unknown>)).toHaveProperty("title");
    });

    it("extracts with scrape_options", async () => {
      const { status, body } = await post("/api/v1/extract", {
        url: SCRAPE_URL,
        selectors: { content: "p" },
        scrape_options: { wait_for: "h1" },
      });
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b.success).toBe(true);
      expect((b.data as Record<string, unknown>)).toHaveProperty("content");
    });

    it("extracts multiple fields", async () => {
      const { status, body } = await post("/api/v1/extract", {
        url: SCRAPE_URL_2,
        selectors: {
          h1: "h1",
          links: "a",
        },
      });
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b.success).toBe(true);
      expect((b.data as Record<string, unknown>)).toHaveProperty("h1");
      expect((b.data as Record<string, unknown>)).toHaveProperty("links");
    });
  });

  // ─── EXTRACT LLM ──────────────────────────────────────────────────────────
  describe("POST /api/v1/extract/llm", () => {
    it("extracts with LLM using a prompt", async () => {
      const { status, body } = await post("/api/v1/extract/llm", {
        prompt: "What is the main heading on this page? Return JSON with a 'heading' field.",
        url: SCRAPE_URL,
      });
      // LLM extract may fail if OpenAI not configured — gateway should still proxy
      expect([200, 500, 502]).toContain(status);
      const b = body as Record<string, unknown>;
      if (status === 200) {
        expect(b).toBeDefined();
      } else {
        expect((b as { error?: string }).error ?? (b as { detail?: string }).detail).toBeDefined();
      }
    });

    it("returns 400 for missing prompt", async () => {
      const { status, body } = await post("/api/v1/extract/llm", {
        url: SCRAPE_URL,
      });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toMatch(/Missing prompt/i);
    });

    it("returns 400 when neither url nor urls provided", async () => {
      const { status, body } = await post("/api/v1/extract/llm", {
        prompt: "Extract data",
      });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toMatch(/at least one URL/i);
    });

    it("returns 400 for private IP in url (SSRF)", async () => {
      const { status } = await post("/api/v1/extract/llm", {
        prompt: "Extract",
        url: "http://10.0.0.1",
      });
      expect(status).toBe(400);
    });

    it("returns 400 for private IP in urls array (SSRF)", async () => {
      const { status } = await post("/api/v1/extract/llm", {
        prompt: "Extract",
        urls: ["http://192.168.0.1"],
      });
      expect(status).toBe(400);
    });

    it("proxies with urls array", async () => {
      const { status } = await post("/api/v1/extract/llm", {
        prompt: "Summarize these pages",
        urls: [SCRAPE_URL],
      });
      expect([200, 500, 502]).toContain(status);
    });

    it("proxies with async=true", async () => {
      const { status, body } = await post("/api/v1/extract/llm", {
        prompt: "Extract the heading",
        url: SCRAPE_URL,
        async: true,
      });
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("job_id");
    });

    it("proxies with async_job=true", async () => {
      const { status, body } = await post("/api/v1/extract/llm", {
        prompt: "Extract the heading",
        url: SCRAPE_URL,
        async_job: true,
      });
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("job_id");
    });
  });

  // ─── JOBS (polling async results) ─────────────────────────────────────────
  describe("GET /api/v1/jobs/:id", () => {
    let jobId: string;

    beforeAll(async () => {
      const { body } = await post("/api/v1/scrape", {
        url: SCRAPE_URL,
        formats: ["markdown"],
        async: true,
      });
      jobId = (body as { job_id: string }).job_id;
    });

    it("polls async job status", async () => {
      const { status, body } = await get(`/api/v1/jobs/${jobId}`);
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("status");
      expect(["pending", "completed", "failed"]).toContain(b.status as string);
    });

    it("returns 404 for non-existent job", async () => {
      const { status } = await get("/api/v1/jobs/nonexistent-job-id");
      expect(status).toBe(404);
    });
  });

  describe("GET /api/v1/extract/jobs/:id", () => {
    let jobId: string;

    beforeAll(async () => {
      const { body } = await post("/api/v1/extract/llm", {
        prompt: "Extract heading",
        url: SCRAPE_URL,
        async: true,
      });
      jobId = (body as { job_id: string }).job_id;
    });

    it("polls LLM extract job status", async () => {
      const { status, body } = await get(`/api/v1/extract/jobs/${jobId}`);
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("status");
    });
  });
});
