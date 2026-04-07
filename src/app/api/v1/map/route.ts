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

  const forward: Record<string, unknown> = { url: rawUrl };

  if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
    forward.limit = Math.max(1, Math.min(30000, Math.floor(body.limit)));
  }
  if (typeof body.ignoreSitemap === "boolean") {
    forward.ignoreSitemap = body.ignoreSitemap;
  }
  if (typeof body.includeSubdomains === "boolean") {
    forward.includeSubdomains = body.includeSubdomains;
  }
  if (typeof body.search === "string" && body.search.trim()) {
    forward.search = body.search.trim();
  }
  if (typeof body.timeout === "number" && Number.isFinite(body.timeout)) {
    forward.timeout = body.timeout;
  }

  try {
    const res = await modalRequest("/map", {
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
