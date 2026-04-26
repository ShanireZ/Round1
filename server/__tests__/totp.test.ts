/**
 * Tests for: TOTP envelope encryption (server/services/auth/totpService.ts)
 */
import * as OTPAuth from "otpauth";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../config/env.js", () => ({
  env: {
    TOTP_ENCRYPTION_KEK: "test-kek-for-vitest-at-least-16-chars",
  },
}));

import {
  encryptTotpSecret,
  decryptTotpSecret,
  generateTotpSecret,
  verifyTotp,
} from "../services/auth/totpService.js";

describe("TOTP Service — Envelope Encryption", () => {
  const testSecret = "JBSWY3DPEHPK3PXP"; // base32 encoded

  it("encrypts and decrypts a TOTP secret successfully", () => {
    const encrypted = encryptTotpSecret(testSecret);
    const decrypted = decryptTotpSecret(encrypted);
    expect(decrypted).toBe(testSecret);
  });

  it("produces different ciphertext for same plaintext (random IV + DEK)", () => {
    const enc1 = encryptTotpSecret(testSecret);
    const enc2 = encryptTotpSecret(testSecret);
    expect(enc1).not.toBe(enc2);
  });

  it("encrypted format has two colon-separated base64 segments", () => {
    const encrypted = encryptTotpSecret(testSecret);
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(2);
    // Both parts should be valid base64
    for (const part of parts) {
      expect(() => Buffer.from(part, "base64")).not.toThrow();
      expect(part.length).toBeGreaterThan(0);
    }
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encryptTotpSecret(testSecret);
    const parts = encrypted.split(":");
    // Tamper with data part
    const tampered = parts[0] + ":" + Buffer.from("tampered-data").toString("base64");
    expect(() => decryptTotpSecret(tampered)).toThrow();
  });

  it("throws on invalid format (wrong number of parts)", () => {
    expect(() => decryptTotpSecret("single-part")).toThrow("Invalid TOTP encrypted format");
    expect(() => decryptTotpSecret("a:b:c")).toThrow("Invalid TOTP encrypted format");
  });
});

describe("TOTP Service — Secret Generation", () => {
  it("generates a valid TOTP secret and otpauth URL", () => {
    const { secret, otpauthUrl } = generateTotpSecret("testuser");
    expect(secret).toBeTruthy();
    expect(secret.length).toBeGreaterThan(0);
    expect(otpauthUrl).toContain("otpauth://totp/");
    expect(otpauthUrl).toContain("Round1");
    expect(otpauthUrl).toContain("testuser");
  });

  it("generates different secrets each time", () => {
    const { secret: s1 } = generateTotpSecret("user1");
    const { secret: s2 } = generateTotpSecret("user2");
    expect(s1).not.toBe(s2);
  });
});

describe("TOTP Service — Verification", () => {
  it("verifies a correct TOTP code", () => {
    const { secret } = generateTotpSecret("testuser");
    // Generate a valid code from the same secret
    const totp = new OTPAuth.TOTP({
      issuer: "Round1",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const validCode = totp.generate();

    expect(verifyTotp(secret, validCode)).toBe(true);
  });

  it("rejects an incorrect TOTP code", () => {
    const { secret } = generateTotpSecret("testuser");
    expect(verifyTotp(secret, "000000")).toBe(false);
    expect(verifyTotp(secret, "999999")).toBe(false);
  });

  it("full roundtrip: generate → encrypt → decrypt → verify", () => {
    const { secret } = generateTotpSecret("roundtrip-user");
    const encrypted = encryptTotpSecret(secret);
    const decrypted = decryptTotpSecret(encrypted);

    const totp = new OTPAuth.TOTP({
      issuer: "Round1",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(decrypted),
    });
    const code = totp.generate();

    expect(verifyTotp(decrypted, code)).toBe(true);
  });
});
