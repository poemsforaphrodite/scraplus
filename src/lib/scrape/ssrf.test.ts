import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, SsrfError } from "./ssrf";

describe("assertPublicHttpUrl", () => {
  it("allows example.com", () => {
    expect(assertPublicHttpUrl("https://example.com/a").hostname).toBe(
      "example.com",
    );
  });
  it("blocks loopback", () => {
    expect(() => assertPublicHttpUrl("http://127.0.0.1:3000")).toThrow(
      SsrfError,
    );
  });
  it("blocks file", () => {
    expect(() => assertPublicHttpUrl("file:///etc/passwd")).toThrow(SsrfError);
  });
});
