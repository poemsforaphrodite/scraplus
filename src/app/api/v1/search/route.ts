import { NextResponse } from "next/server";
import { modalRequest } from "@/lib/scraplus/modal-proxy";

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

  const query =
    typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const forward: Record<string, unknown> = { query };

  if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
    forward.limit = Math.max(1, Math.min(100, Math.floor(body.limit)));
  }
  if (typeof body.lang === "string" && body.lang.trim()) {
    forward.lang = body.lang.trim();
  }
  if (typeof body.location === "string" && body.location.trim()) {
    forward.location = body.location.trim();
  }
  if (typeof body.timeout === "number" && Number.isFinite(body.timeout)) {
    forward.timeout = body.timeout;
  }
  if (
    body.scrapeOptions != null &&
    typeof body.scrapeOptions === "object" &&
    !Array.isArray(body.scrapeOptions)
  ) {
    forward.scrapeOptions = body.scrapeOptions;
  }

  try {
    const res = await modalRequest("/search", {
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
