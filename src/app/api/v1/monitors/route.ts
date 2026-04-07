import { NextResponse } from "next/server";
import { proxyToModal } from "@/lib/scraplus/proxy-helper";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }
  if (!body.cron || typeof body.cron !== "string") {
    return NextResponse.json({ error: "Missing cron" }, { status: 400 });
  }
  return proxyToModal("/monitors", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function GET() {
  return proxyToModal("/monitors", { method: "GET" });
}
