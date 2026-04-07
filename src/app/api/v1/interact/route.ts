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

  if (!Array.isArray(body.actions) || body.actions.length === 0) {
    return NextResponse.json(
      { error: "actions must be a non-empty array" },
      { status: 400 },
    );
  }

  const forward: Record<string, unknown> = {
    url: rawUrl,
    actions: body.actions,
  };

  if (typeof body.timeout === "number" && Number.isFinite(body.timeout)) {
    forward.timeout = body.timeout;
  }
  if (Array.isArray(body.formats) && body.formats.length > 0) {
    forward.formats = body.formats.map((f) => String(f).toLowerCase().trim());
  }
  if (
    body.headers != null &&
    typeof body.headers === "object" &&
    !Array.isArray(body.headers)
  ) {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.headers)) {
      if (typeof v === "string") headers[k] = v;
    }
    if (Object.keys(headers).length) forward.headers = headers;
  }

  try {
    const res = await modalRequest("/interact", {
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
