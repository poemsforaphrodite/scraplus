export interface ScraplusConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface ScrapeOptions {
  url: string;
  mode?: "auto" | "html" | "js" | "pdf" | "ocr";
  formats?: string[];
  timeout?: number;
  headers?: Record<string, string>;
  screenshot?: boolean | { fullPage?: boolean; quality?: number; viewport?: { width: number; height: number } };
  wait_for?: string;
  mobile?: boolean;
  only_main_content?: boolean;
  include_tags?: string[];
  exclude_tags?: string[];
}

export interface ScrapeResult {
  url: string;
  status_code: number;
  content: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BatchOptions {
  urls: string[];
  mode?: string;
  formats?: string[];
  timeout?: number;
  webhook?: { url: string; secret?: string };
}

export interface CrawlOptions {
  url: string;
  limit?: number;
  max_depth?: number;
  formats?: string[];
  include_paths?: string[];
  exclude_paths?: string[];
  webhook?: { url: string; secret?: string };
}

export interface MapOptions {
  url: string;
  limit?: number;
  ignoreSitemap?: boolean;
  includeSubdomains?: boolean;
  search?: string;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  lang?: string;
  location?: string;
  scrapeOptions?: Partial<ScrapeOptions>;
}

export interface ExtractOptions {
  url: string;
  selectors: Record<string, string>;
  schema?: Record<string, unknown>;
}

export interface ExtractLlmOptions {
  url?: string;
  urls?: string[];
  prompt: string;
  schema?: Record<string, unknown>;
}

export interface InteractAction {
  type: "click" | "type" | "scroll" | "wait" | "screenshot";
  selector?: string;
  text?: string;
  value?: number;
}

export interface InteractOptions {
  url: string;
  actions: InteractAction[];
  timeout?: number;
  formats?: string[];
}

export class Scraplus {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ScraplusConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || "http://localhost:3000").replace(
      /\/$/,
      "",
    );
  }

  private async request<T>(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Scraplus API error ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async scrape(options: ScrapeOptions): Promise<ScrapeResult> {
    return this.request("/scrape", "POST", options);
  }

  async batch(
    options: BatchOptions,
  ): Promise<{ id: string; status: string }> {
    return this.request("/batch", "POST", options);
  }

  async getBatch(id: string): Promise<Record<string, unknown>> {
    return this.request(`/batch/${id}`, "GET");
  }

  async crawl(
    options: CrawlOptions,
  ): Promise<{ id: string; status: string }> {
    return this.request("/crawl", "POST", options);
  }

  async getCrawl(id: string): Promise<Record<string, unknown>> {
    return this.request(`/crawl/${id}`, "GET");
  }

  async map(
    options: MapOptions,
  ): Promise<{ success: boolean; links: string[] }> {
    return this.request("/map", "POST", options);
  }

  async search(
    options: SearchOptions,
  ): Promise<{ success: boolean; data: Record<string, unknown>[] }> {
    return this.request("/search", "POST", options);
  }

  async extract(options: ExtractOptions): Promise<Record<string, unknown>> {
    return this.request("/extract", "POST", options);
  }

  async extractLlm(
    options: ExtractLlmOptions,
  ): Promise<Record<string, unknown>> {
    return this.request("/extract/llm", "POST", options);
  }

  async interact(options: InteractOptions): Promise<Record<string, unknown>> {
    return this.request("/interact", "POST", options);
  }

  async getUsage(): Promise<Record<string, unknown>> {
    return this.request("/usage", "GET");
  }
}

export default Scraplus;
