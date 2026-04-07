import { NextResponse } from "next/server";
import { proxyToModal } from "@/lib/scraplus/proxy-helper";

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // body is optional for key creation
  }
  return proxyToModal("/auth/keys", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function GET() {
  return proxyToModal("/auth/keys", { method: "GET" });
}
