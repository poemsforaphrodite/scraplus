/** Basic SSRF guards — extend with DNS rebinding protection for production. */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "metadata.google.internal",
  "metadata.goog",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal"];

const PRIVATE_IPV4 =
  /^(127\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("Invalid URL");
  }

  if (url.username || url.password) {
    throw new SsrfError("URLs with credentials are not allowed");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("Only http and https URLs are allowed");
  }

  const host = url.hostname.toLowerCase();

  if (host === "[::1]" || host === "0000:0000:0000:0000:0000:0000:0000:0001") {
    throw new SsrfError("Private hosts are not allowed");
  }

  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new SsrfError("Host is blocked");
  }

  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new SsrfError("Host suffix is blocked");
  }

  if (PRIVATE_IPV4.test(host)) {
    throw new SsrfError("Private IP addresses are not allowed");
  }

  return url;
}

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}
