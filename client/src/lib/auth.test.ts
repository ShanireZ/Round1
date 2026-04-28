import { describe, expect, it } from "vitest";

import { isValidAuthUsername, normalizeAuthCode, resolveAuthReturnTo } from "./auth";

describe("auth helpers", () => {
  it("normalizes one-time codes without changing digits", () => {
    expect(normalizeAuthCode(" 12 34 56 ")).toBe("123456");
  });

  it("keeps auth return paths site-relative and away from auth loops", () => {
    expect(resolveAuthReturnTo("/exams/new")).toBe("/exams/new");
    expect(resolveAuthReturnTo("//evil.example")).toBe("/dashboard");
    expect(resolveAuthReturnTo("https://evil.example")).toBe("/dashboard");
    expect(resolveAuthReturnTo("/login")).toBe("/dashboard");
    expect(resolveAuthReturnTo("/auth/complete-profile?ticket=abc")).toBe("/dashboard");
  });

  it("matches the server username shape before submit", () => {
    expect(isValidAuthUsername("Round12026")).toBe(true);
    expect(isValidAuthUsername("r1")).toBe(false);
    expect(isValidAuthUsername("round-1")).toBe(false);
  });
});
