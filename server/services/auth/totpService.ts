import crypto from "node:crypto";
import * as OTPAuth from "otpauth";
import { env } from "../../../config/env.js";

// ── Constants ────────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm" as const;
const IV_BYTES = 12;
const DEK_BYTES = 32;
const AUTH_TAG_BYTES = 16;
const TOTP_ISSUER = "Round1";
const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;

// ── KEK helpers ──────────────────────────────────────────────────────

function getKek(): Buffer {
  const raw = env.TOTP_ENCRYPTION_KEK;
  // Derive a 32-byte key from the env var using SHA-256
  return crypto.createHash("sha256").update(raw).digest();
}

// ── Envelope encryption ──────────────────────────────────────────────

/**
 * Encrypt a TOTP secret using AES-256-GCM envelope encryption.
 * Format: base64(IV):base64(encryptedDEK):base64(ciphertext):base64(authTag)
 */
export function encryptTotpSecret(secret: string): string {
  const kek = getKek();

  // 1. Generate random DEK
  const dek = crypto.randomBytes(DEK_BYTES);

  // 2. Encrypt the actual secret with DEK
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, dek, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // 3. Encrypt DEK with KEK
  const dekIv = crypto.randomBytes(IV_BYTES);
  const dekCipher = crypto.createCipheriv(ALGORITHM, kek, dekIv);
  const encryptedDek = Buffer.concat([
    dekCipher.update(dek),
    dekCipher.final(),
  ]);
  const dekAuthTag = dekCipher.getAuthTag();

  // 4. Pack: dekIv + dekAuthTag + encryptedDek + iv + authTag + ciphertext
  //    Stored as colon-separated base64 segments for readability
  return [
    Buffer.concat([dekIv, dekAuthTag, encryptedDek]).toString("base64"),
    Buffer.concat([iv, authTag, ciphertext]).toString("base64"),
  ].join(":");
}

/**
 * Decrypt a TOTP secret from the stored envelope format.
 */
export function decryptTotpSecret(stored: string): string {
  const kek = getKek();
  const parts = stored.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid TOTP encrypted format");
  }

  const dekPart = parts[0]!;
  const dataPart = parts[1]!;

  // 1. Unpack DEK envelope
  const dekEnvelope = Buffer.from(dekPart, "base64");
  const dekIv = dekEnvelope.subarray(0, IV_BYTES);
  const dekAuthTag = dekEnvelope.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const encryptedDek = dekEnvelope.subarray(IV_BYTES + AUTH_TAG_BYTES);

  // 2. Decrypt DEK with KEK
  const dekDecipher = crypto.createDecipheriv(ALGORITHM, kek, dekIv);
  dekDecipher.setAuthTag(dekAuthTag);
  const dek = Buffer.concat([
    dekDecipher.update(encryptedDek),
    dekDecipher.final(),
  ]);

  // 3. Unpack data envelope
  const dataEnvelope = Buffer.from(dataPart, "base64");
  const iv = dataEnvelope.subarray(0, IV_BYTES);
  const authTag = dataEnvelope.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = dataEnvelope.subarray(IV_BYTES + AUTH_TAG_BYTES);

  // 4. Decrypt secret with DEK
  const decipher = crypto.createDecipheriv(ALGORITHM, dek, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

// ── TOTP generation / verification ───────────────────────────────────

/**
 * Generate a new TOTP secret and return base32 secret + otpauth URI.
 */
export function generateTotpSecret(username: string): {
  secret: string;
  otpauthUrl: string;
} {
  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: username,
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: new OTPAuth.Secret({ size: 20 }),
  });

  return {
    secret: totp.secret.base32,
    otpauthUrl: totp.toString(),
  };
}

/**
 * Verify a TOTP token against a base32 secret. Allows ±1 window for clock drift.
 */
export function verifyTotp(secret: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}
