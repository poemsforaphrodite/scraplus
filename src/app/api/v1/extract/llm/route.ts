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

  const prompt =
    typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  let url: string | undefined;
  if (typeof body.url === "string" && body.url.trim()) {
    url = body.url.trim();
    try {
      assertPublicHttpUrl(url);
    } catch (e) {
      if (e instanceof SsrfError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
  }

  let urls: string[] = [];
  if (Array.isArray(body.urls)) {
    for (const u of body.urls) {
      const s = String(u).trim();
      if (!s) continue;
      try {
        assertPublicHttpUrl(s);
        urls.push(s);
      } catch (e) {
        if (e instanceof SsrfError) {
          return NextResponse.json(
            { error: `Blocked URL: ${e.message}`, url: s },
            { status: 400 },
          );
        }
        throw e;
      }
    }
  }

  if (!url && urls.length === 0) {
    return NextResponse.json(
      { error: "Provide url and/or urls[] (Scraplus requires at least one URL for LLM extract today)." },
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

  const asyncJob = Boolean(
    body.async === true || body.async_job === true,
  );

  const forward: Record<string, unknown> = {
    prompt,
    mode,
    timeout,
    ...(url ? { url } : {}),
    ...(urls.length ? { urls } : {}),
    ...(headers && Object.keys(headers).length ? { headers } : {}),
    ...(asyncJob ? { async: true } : {}),
  };
  if (
    body.schema != null &&
    typeof body.schema === "object" &&
    !Array.isArray(body.schema)
  ) {
    forward.schema = body.schema;
  }

  try {
    const res = await modalRequest("/extract/llm", {
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
