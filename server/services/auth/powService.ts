import crypto from "node:crypto";
import { env } from "../../../config/env.js";
import { redisClient } from "../../redis.js";
import { logger } from "../../logger.js";

// ── Constants ────────────────────────────────────────────────────────

const POW_PREFIX = "pow:";
const POW_TTL_SECONDS = 60;

// ── Types ────────────────────────────────────────────────────────────

export interface PowChallenge {
  challengeId: string;
  challenge: string;
  difficulty: number;
}

export interface PowSolution {
  challengeId: string;
  nonce: string;
}

// ── Challenge management ─────────────────────────────────────────────

/**
 * Create a new PoW challenge and store it in Redis.
 *
 * The challenge is a random hex string. The client must find a `nonce` such
 * that `SHA-256(challenge + nonce)` has at least `difficulty` leading zero bits.
 */
export async function createPowChallenge(
  difficulty?: number,
): Promise<PowChallenge> {
  const challengeId = crypto.randomUUID();
  const challenge = crypto.randomBytes(32).toString("hex");
  const diff = difficulty ?? env.AUTH_POW_BASE_DIFFICULTY;

  await redisClient.set(
    `${POW_PREFIX}${challengeId}`,
    JSON.stringify({ challenge, difficulty: diff }),
    { EX: POW_TTL_SECONDS },
  );

  return { challengeId, challenge, difficulty: diff };
}

/**
 * Verify a PoW solution.
 *
 * - Retrieves the challenge from Redis (one-time use — deleted after read).
 * - Checks that SHA-256(challenge + nonce) has the required leading zero bits.
 *
 * Returns `true` if valid, `false` otherwise.
 */
export async function verifyPowSolution(
  solution: PowSolution,
): Promise<boolean> {
  const key = `${POW_PREFIX}${solution.challengeId}`;

  // Atomic get-and-delete to prevent replay
  const raw = await redisClient.getDel(key);
  if (!raw) {
    logger.warn(
      { challengeId: solution.challengeId },
      "PoW challenge not found or expired",
    );
    return false;
  }

  let stored: { challenge: string; difficulty: number };
  try {
    stored = JSON.parse(raw);
  } catch {
    return false;
  }

  return checkHash(stored.challenge, solution.nonce, stored.difficulty);
}

// ── Hash verification ────────────────────────────────────────────────

/**
 * Check whether SHA-256(challenge + nonce) has at least `difficulty` leading
 * zero bits (HashCash-style).
 */
export function checkHash(
  challenge: string,
  nonce: string,
  difficulty: number,
): boolean {
  const hash = crypto
    .createHash("sha256")
    .update(challenge + nonce)
    .digest();

  return hasLeadingZeroBits(hash, difficulty);
}

/**
 * Test whether a buffer has at least `n` leading zero bits.
 */
function hasLeadingZeroBits(buf: Buffer, n: number): boolean {
  const fullBytes = Math.floor(n / 8);
  const remainBits = n % 8;

  for (let i = 0; i < fullBytes; i++) {
    if (buf[i] !== 0) return false;
  }

  if (remainBits > 0) {
    const mask = 0xff << (8 - remainBits);
    if ((buf[fullBytes]! & mask) !== 0) return false;
  }

  return true;
}
