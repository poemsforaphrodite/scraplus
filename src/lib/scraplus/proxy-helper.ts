import { NextResponse } from "next/server";
import { modalRequest } from "@/lib/scraplus/modal-proxy";

export function configErrorResponse() {
  return NextResponse.json(
    {
      error:
        "Modal backend not configured. Set SCRAPLUS_MODAL_BASE_URL and SCRAPLUS_PROXY_SECRET.",
    },
    { status: 503 },
  );
}

export async function proxyToModal(
  path: string,
  init: RequestInit,
): Promise<NextResponse> {
  try {
    const res = await modalRequest(path, init);
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
