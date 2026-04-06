import { NextResponse } from "next/server";
import { modalRequest } from "@/lib/scraplus/modal-proxy";
import { clampScrapeTimeout } from "@/lib/scraplus/timeout";
import { assertPublicHttpUrl, SsrfError } from "@/lib/scrape/ssrf";

const ALLOWED_MODES = new Set(["html", "js", "auto", "pdf", "ocr"]);
const ALLOWED_FORMATS = new Set(["html", "text", "markdown", "json"]);

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

  const modeRaw =
    typeof body.mode === "string" ? body.mode.toLowerCase().trim() : "auto";
  if (!ALLOWED_MODES.has(modeRaw)) {
    return NextResponse.json(
      {
        error: `Invalid mode "${modeRaw}"`,
        allowed: [...ALLOWED_MODES],
      },
      { status: 400 },
    );
  }

  let formats: string[];
  if (Array.isArray(body.formats) && body.formats.length > 0) {
    formats = body.formats.map((f) =>
      String(f).toLowerCase().trim(),
    );
  } else {
    formats = ["markdown", "text", "json"];
  }
  const unknown = formats.filter((f) => !ALLOWED_FORMATS.has(f));
  if (unknown.length) {
    return NextResponse.json(
      {
        error: `Unknown formats: ${unknown.join(", ")}`,
        allowed: [...ALLOWED_FORMATS],
      },
      { status: 400 },
    );
  }

  const timeout = clampScrapeTimeout(body.timeout);

  let headers: Record<string, string> | undefined;
  if (body.headers != null) {
    if (
      typeof body.headers !== "object" ||
      Array.isArray(body.headers)
    ) {
      return NextResponse.json({ error: "headers must be an object" }, {
        status: 400,
      });
    }
    headers = {};
    for (const [k, v] of Object.entries(body.headers)) {
      if (typeof v === "string") headers[k] = v;
    }
  }

  const wait_for =
    typeof body.wait_for === "string" ? body.wait_for : undefined;
  const screenshot = Boolean(body.screenshot);
  const asyncJob = Boolean(
    body.async === true || body.async_job === true,
  );

  const forward: Record<string, unknown> = {
    url: rawUrl,
    mode: modeRaw,
    formats,
    timeout,
    ...(headers && Object.keys(headers).length ? { headers } : {}),
    ...(wait_for ? { wait_for } : {}),
    ...(screenshot ? { screenshot: true } : {}),
    ...(asyncJob ? { async: true } : {}),
  };

  const boolOr = (k: string) =>
    body[k] === true ? { [k]: true } : {};
  Object.assign(forward, boolOr("only_main_content"));
  Object.assign(forward, boolOr("mobile"));
  Object.assign(forward, boolOr("skip_tls_verification"));
  if (typeof body.verify_ssl === "boolean") {
    forward.verify_ssl = body.verify_ssl;
  }
  if (typeof body.wait_ms === "number" && Number.isFinite(body.wait_ms)) {
    forward.wait_ms = Math.max(0, Math.floor(body.wait_ms));
  }
  if (typeof body.proxy === "string" && body.proxy.trim()) {
    forward.proxy = body.proxy.trim();
  }
  if (typeof body.max_age_ms === "number" && Number.isFinite(body.max_age_ms)) {
    forward.max_age_ms = Math.max(0, Math.floor(body.max_age_ms));
  }
  if (typeof body.min_age_ms === "number" && Number.isFinite(body.min_age_ms)) {
    forward.min_age_ms = Math.max(0, Math.floor(body.min_age_ms));
  }
  if (typeof body.pdf_mode === "string" && body.pdf_mode.trim()) {
    forward.pdf_mode = body.pdf_mode.trim().toLowerCase();
  }
  if (Array.isArray(body.include_tags) && body.include_tags.length) {
    forward.include_tags = body.include_tags.map((t) => String(t));
  }
  if (Array.isArray(body.exclude_tags) && body.exclude_tags.length) {
    forward.exclude_tags = body.exclude_tags.map((t) => String(t));
  }
  if (
    body.scrape_options != null &&
    typeof body.scrape_options === "object" &&
    !Array.isArray(body.scrape_options)
  ) {
    forward.scrape_options = body.scrape_options;
  }

  try {
    const res = await modalRequest("/scrape", {
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
