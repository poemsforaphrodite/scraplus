import { NextResponse } from "next/server";
import { modalRequest } from "@/lib/scraplus/modal-proxy";
import { clampScrapeTimeout } from "@/lib/scraplus/timeout";
import { assertPublicHttpUrl, SsrfError } from "@/lib/scrape/ssrf";

const ALLOWED_MODES = new Set(["html", "js", "auto", "pdf", "ocr"]);

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

  const urlsRaw = body.urls;
  if (!Array.isArray(urlsRaw) || urlsRaw.length === 0) {
    return NextResponse.json(
      { error: "urls must be a non-empty array" },
      { status: 400 },
    );
  }

  const urls: string[] = [];
  for (const u of urlsRaw) {
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

  if (urls.length === 0) {
    return NextResponse.json({ error: "No valid URLs" }, { status: 400 });
  }

  const modeRaw =
    typeof body.mode === "string" ? body.mode.toLowerCase().trim() : "auto";
  if (!ALLOWED_MODES.has(modeRaw)) {
    return NextResponse.json(
      { error: `Invalid mode "${modeRaw}"`, allowed: [...ALLOWED_MODES] },
      { status: 400 },
    );
  }

  let formats: string[] | undefined;
  if (Array.isArray(body.formats) && body.formats.length > 0) {
    formats = body.formats.map((f) => String(f).toLowerCase().trim());
  }

  let headers: Record<string, string> | undefined;
  if (body.headers != null && typeof body.headers === "object" && !Array.isArray(body.headers)) {
    headers = {};
    for (const [k, v] of Object.entries(body.headers)) {
      if (typeof v === "string") headers[k] = v;
    }
  }

  const forward: Record<string, unknown> = {
    urls,
    mode: modeRaw,
    timeout: clampScrapeTimeout(body.timeout),
  };
  if (formats) forward.formats = formats;
  if (headers && Object.keys(headers).length) forward.headers = headers;
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
    const res = await modalRequest("/batch", {
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
