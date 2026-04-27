import { describe, expect, it } from "vitest";

import { validatePasswordStrength } from "../services/auth/passwordPolicy.js";

describe("password policy", () => {
  it("keeps the standard user threshold at zxcvbn score 3", () => {
    const result = validatePasswordStrength({
      password: "Correct12345!!",
      role: "student",
      username: "alice",
    });

    expect(result.ok).toBe(true);
    expect(result.minScore).toBe(3);
    expect(result.minLength).toBe(8);
  });

  it("requires stronger admin passwords", () => {
    const result = validatePasswordStrength({
      password: "Correct12345!!",
      role: "admin",
      username: "elder",
    });

    expect(result.ok).toBe(false);
    expect(result.minScore).toBe(4);
    expect(result.minLength).toBe(14);
  });

  it("accepts admin passphrases that meet the bootstrap policy", () => {
    const result = validatePasswordStrength({
      password: "correct-horse-battery-staple-2026",
      role: "admin",
      username: "elder",
    });

    expect(result.ok).toBe(true);
  });
});
