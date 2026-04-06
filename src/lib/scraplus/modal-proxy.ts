const HDR = "X-Scraplus-Secret";

export function getModalConfig(): { baseUrl: string; secret: string } {
  const baseUrl = process.env.SCRAPLUS_MODAL_BASE_URL?.trim() ?? "";
  const secret = process.env.SCRAPLUS_PROXY_SECRET?.trim() ?? "";
  if (!baseUrl || !secret) {
    throw new Error("SCRAPLUS_MODAL_BASE_URL and SCRAPLUS_PROXY_SECRET must be set");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), secret };
}

export async function modalRequest(
  path: string,
  init: RequestInit & { skipJsonBody?: boolean } = {},
): Promise<Response> {
  const { baseUrl, secret } = getModalConfig();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const { skipJsonBody, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set(HDR, secret);
  if (
    !skipJsonBody &&
    rest.body &&
    typeof rest.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...rest, headers });
}
