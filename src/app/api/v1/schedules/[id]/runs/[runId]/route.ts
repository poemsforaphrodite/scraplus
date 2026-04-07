import { proxyToModal } from "@/lib/scraplus/proxy-helper";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const { id, runId } = await params;
  return proxyToModal(
    `/schedules/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`,
    { method: "GET" },
  );
}
