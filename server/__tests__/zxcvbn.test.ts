/**
 * Tests for: zxcvbn weak password detection
 *
 * The auth routes use zxcvbn with score < 3 as rejection threshold.
 */
import { describe, it, expect } from "vitest";
import zxcvbn from "zxcvbn";

describe("zxcvbn — Weak Password Detection", () => {
  // ── Weak passwords (score < 3) → should be rejected ────────────────
  const weakPasswords = [
    { pw: "password", label: "dictionary word 'password'" },
    { pw: "12345678", label: "sequential digits" },
    { pw: "qwerty12", label: "keyboard pattern" },
    { pw: "abcdefgh", label: "alphabetical sequence" },
    { pw: "iloveyou", label: "common phrase" },
    { pw: "11111111", label: "repeated character" },
    { pw: "admin123", label: "common admin password" },
    { pw: "letmein1", label: "common phrase 'letmein'" },
    { pw: "welcome1", label: "'welcome' variant" },
  ];

  for (const { pw, label } of weakPasswords) {
    it(`rejects weak password: ${label} ("${pw}")`, () => {
      const result = zxcvbn(pw);
      expect(result.score).toBeLessThan(3);
    });
  }

  // ── Strong passwords (score >= 3) → should be accepted ─────────────
  const strongPasswords = [
    { pw: "X#9kL$2mN!pQ7w", label: "mixed symbols & letters" },
    { pw: "correct-horse-battery-staple", label: "passphrase (4 words)" },
    { pw: "Tr0ub4dor&3xYz", label: "complex mix" },
    { pw: "j8Fk2!mPqR#5nW", label: "random alphanumeric + symbols" },
    { pw: "MyD0gAteThe#Homework99", label: "sentence-like passphrase" },
  ];

  for (const { pw, label } of strongPasswords) {
    it(`accepts strong password: ${label}`, () => {
      const result = zxcvbn(pw);
      expect(result.score).toBeGreaterThanOrEqual(3);
    });
  }

  // ── Context-aware detection ────────────────────────────────────────
  it("weakens password if it contains the username", () => {
    const result = zxcvbn("alice12345678", ["alice"]);
    // Including username as user_input should lower score
    expect(result.score).toBeLessThan(3);
  });

  it("returns feedback for weak passwords", () => {
    const result = zxcvbn("password");
    expect(result.feedback).toBeDefined();
    expect(
      result.feedback.warning || result.feedback.suggestions.length > 0,
    ).toBeTruthy();
  });

  // ── Edge cases ─────────────────────────────────────────────────────
  it("handles minimum length password (8 chars)", () => {
    const result = zxcvbn("aB3$xY7!");
    // 8-char random should score okay
    expect(result.score).toBeGreaterThanOrEqual(2);
  });

  it("handles very long password", () => {
    const longPw = "kL3$mN7!pQ" + "A".repeat(100);
    const result = zxcvbn(longPw);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });
});
