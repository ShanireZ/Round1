/**
 * Tests for: safeReturnTo open redirect protection (config/auth.ts)
 */
import { describe, it, expect } from "vitest";
import { safeReturnTo } from "../../config/auth.js";

describe("safeReturnTo — Open Redirect Protection", () => {
  // ── Valid paths ────────────────────────────────────────────────────
  it("returns / for undefined input", () => {
    expect(safeReturnTo(undefined)).toBe("/");
  });

  it("returns / for empty string", () => {
    expect(safeReturnTo("")).toBe("/");
  });

  it("accepts simple relative path", () => {
    expect(safeReturnTo("/dashboard")).toBe("/dashboard");
  });

  it("accepts nested relative path with query", () => {
    expect(safeReturnTo("/settings/security?tab=passkey")).toBe(
      "/settings/security?tab=passkey",
    );
  });

  it("accepts path with hash fragment", () => {
    expect(safeReturnTo("/docs#section-1")).toBe("/docs#section-1");
  });

  it("accepts root /", () => {
    expect(safeReturnTo("/")).toBe("/");
  });

  it("accepts encoded path (returns decoded form)", () => {
    // safeReturnTo decodes first, so the returned path is the decoded version
    expect(safeReturnTo("/auth/complete-profile?ticket=abc%3D123")).toBe(
      "/auth/complete-profile?ticket=abc=123",
    );
  });

  // ── Rejected inputs ────────────────────────────────────────────────
  it("rejects double-slash protocol-relative URL", () => {
    expect(safeReturnTo("//evil.com")).toBe("/");
  });

  it("rejects absolute URL (http)", () => {
    expect(safeReturnTo("http://evil.com/path")).toBe("/");
  });

  it("rejects absolute URL (https)", () => {
    expect(safeReturnTo("https://evil.com/path")).toBe("/");
  });

  it("rejects javascript: protocol", () => {
    expect(safeReturnTo("javascript:alert(1)")).toBe("/");
  });

  it("rejects JAVASCRIPT: protocol (case insensitive)", () => {
    expect(safeReturnTo("JAVASCRIPT:alert(1)")).toBe("/");
  });

  it("rejects data: protocol", () => {
    expect(safeReturnTo("data:text/html,<h1>pwned</h1>")).toBe("/");
  });

  it("rejects url-encoded javascript: after decode", () => {
    expect(safeReturnTo("%6Aavascript:alert(1)")).toBe("/");
  });

  it("rejects url-encoded double-slash after decode", () => {
    expect(safeReturnTo("%2F%2Fevil.com")).toBe("/");
  });

  it("rejects path that is not a relative path (no leading /)", () => {
    expect(safeReturnTo("evil.com")).toBe("/");
  });

  it("rejects backslash trick (\\/evil.com)", () => {
    // Some browsers treat \\ as /
    expect(safeReturnTo("\\/evil.com")).toBe("/");
  });

  it("handles malformed URL encoding gracefully", () => {
    expect(safeReturnTo("/%E0%A4%")).toBe("/");
  });
});
