import { NextResponse } from "next/server";
import { modalRequest } from "@/lib/scraplus/modal-proxy";
import { assertPublicHttpUrl, SsrfError } from "@/lib/scrape/ssrf";

function configErrorResponse() {
  return NextResponse.json(
    {
      error:
        "Modal backend not configured. Set SCRAPLUS_MODAL_BASE_URL and SCRAPLUS_PROXY_SECRET.",
    },
    { status: 503 },
  );
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawUrl =
    typeof body.url === "string" ? body.url.trim() : "";
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    assertPublicHttpUrl(rawUrl);
  } catch (e) {
    if (e instanceof SsrfError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const forward: Record<string, unknown> = {
    url: rawUrl,
  };
  const numKeys = [
    "limit",
    "max_discovery_depth",
    "delay_sec",
    "max_concurrency",
  ] as const;
  for (const k of numKeys) {
    if (typeof body[k] === "number" && Number.isFinite(body[k])) {
      forward[k] = body[k];
    }
  }
  const strKeys = [
    "sitemap",
    "robots_policy",
  ] as const;
  for (const k of strKeys) {
    if (typeof body[k] === "string" && body[k]!.trim()) {
      forward[k] = String(body[k]).trim().toLowerCase();
    }
  }
  const boolKeys = [
    "regex_on_full_url",
    "crawl_entire_domain",
    "allow_subdomains",
    "allow_external_links",
    "ignore_query_parameters",
  ] as const;
  for (const k of boolKeys) {
    if (typeof body[k] === "boolean") {
      forward[k] = body[k];
    }
  }
  if (Array.isArray(body.include_paths) && body.include_paths.length) {
    forward.include_paths = body.include_paths.map((p) => String(p));
  }
  if (Array.isArray(body.exclude_paths) && body.exclude_paths.length) {
    forward.exclude_paths = body.exclude_paths.map((p) => String(p));
  }
  if (
    body.scrape_options != null &&
    typeof body.scrape_options === "object" &&
    !Array.isArray(body.scrape_options)
  ) {
    forward.scrape_options = body.scrape_options;
  }
  if (
    body.webhook != null &&
    typeof body.webhook === "object" &&
    !Array.isArray(body.webhook)
  ) {
    forward.webhook = body.webhook;
  }

  try {
    const res = await modalRequest("/crawl", {
      method: "POST",
      body: JSON.stringify(forward),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const detail =
        typeof data === "object" &&
        data !== null &&
        "detail" in data &&
        typeof (data as { detail: unknown }).detail === "string"
          ? (data as { detail: string }).detail
          : text || res.statusText;
      return NextResponse.json({ error: detail }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof Error && e.message.includes("SCRAPLUS_")) {
      return configErrorResponse();
    }
    throw e;
  }
}
