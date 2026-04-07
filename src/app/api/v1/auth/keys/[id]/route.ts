import { proxyToModal } from "@/lib/scraplus/proxy-helper";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToModal(`/auth/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
}
