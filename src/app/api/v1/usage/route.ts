import { proxyToModal } from "@/lib/scraplus/proxy-helper";

export async function GET() {
  return proxyToModal("/usage", { method: "GET" });
}
