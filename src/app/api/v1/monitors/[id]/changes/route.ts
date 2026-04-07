import { proxyToModal } from "@/lib/scraplus/proxy-helper";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const skip = url.searchParams.get("skip") || "0";
  const limit = url.searchParams.get("limit") || "50";
  return proxyToModal(
    `/monitors/${encodeURIComponent(id)}/changes?skip=${skip}&limit=${limit}`,
    { method: "GET" },
  );
}
