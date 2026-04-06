import { NextResponse } from "next/server";
import { modalRequest } from "@/lib/scraplus/modal-proxy";
import { clampScrapeTimeout } from "@/lib/scraplus/timeout";
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

  const selectors = body.selectors;
  if (
    selectors == null ||
    typeof selectors !== "object" ||
    Array.isArray(selectors)
  ) {
    return NextResponse.json(
      { error: "selectors must be an object (field -> CSS selector)" },
      { status: 400 },
    );
  }

  const mode =
    typeof body.mode === "string" ? body.mode.toLowerCase().trim() : "auto";
  const timeout = clampScrapeTimeout(body.timeout);

  let headers: Record<string, string> | undefined;
  if (
    body.headers != null &&
    typeof body.headers === "object" &&
    !Array.isArray(body.headers)
  ) {
    headers = {};
    for (const [k, v] of Object.entries(body.headers)) {
      if (typeof v === "string") headers[k] = v;
    }
  }

  const forward: Record<string, unknown> = {
    url: rawUrl,
    selectors,
    mode,
    timeout,
    ...(headers && Object.keys(headers).length ? { headers } : {}),
  };
  if (
    body.schema != null &&
    typeof body.schema === "object" &&
    !Array.isArray(body.schema)
  ) {
    forward.schema = body.schema;
  }
  if (
    body.scrape_options != null &&
    typeof body.scrape_options === "object" &&
    !Array.isArray(body.scrape_options)
  ) {
    forward.scrape_options = body.scrape_options;
  }

  try {
    const res = await modalRequest("/extract", {
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
          : typeof data === "object" &&
              data !== null &&
              "error" in data &&
              typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
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
