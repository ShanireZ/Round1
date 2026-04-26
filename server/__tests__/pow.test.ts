/**
 * PoW service — unit tests for checkHash & integration tests for
 * challenge/verify flow via the /auth/pow-challenge endpoint.
 *
 * NOTE: The vitest-env.setup.ts file sets AUTH_POW_ENABLED=false globally.
 * Tests in this file that need PoW enabled override env at the service level.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "node:crypto";
import http from "node:http";
import supertest from "supertest";

import { checkHash } from "../services/auth/powService.js";
import { createApp } from "../app.js";
import { connectRedis, redisClient, disconnectRedis } from "../redis.js";
import { pool } from "../db.js";
import { env } from "../../config/env.js";
import { seedFromFile } from "../services/auth/blocklistService.js";

const mutableEnv = env as typeof env & {
  AUTH_POW_ENABLED: boolean;
  AUTH_POW_BASE_DIFFICULTY: number;
};

// Mock mail — PoW tests trigger email sending on success
vi.mock("../services/mail/index.js", () => ({
  sendMail: vi.fn(async () => {}),
}));

// ══════════════════════════════════════════════════════════════════════
//  Unit: checkHash (pure function, no IO)
// ══════════════════════════════════════════════════════════════════════

describe("checkHash — SHA-256 leading zero bits", () => {
  it("returns true when hash has enough leading zero bits", () => {
    // Find a valid nonce for difficulty 8 (1 full zero byte)
    const challenge = "test-challenge-001";
    let nonce = 0;
    while (nonce < 1_000_000) {
      const hash = crypto
        .createHash("sha256")
        .update(challenge + String(nonce))
        .digest();
      if (hash[0] === 0) {
        expect(checkHash(challenge, String(nonce), 8)).toBe(true);
        return;
      }
      nonce++;
    }
    throw new Error("Could not find nonce (statistically impossible)");
  });

  it("returns false when hash does not meet difficulty", () => {
    // Use a fixed combo that's extremely unlikely to produce 256 leading zeros
    expect(checkHash("aaa", "bbb", 256)).toBe(false);
  });

  it("difficulty 0 always passes", () => {
    expect(checkHash("any", "thing", 0)).toBe(true);
  });

  it("handles difficulty that is not a multiple of 8", () => {
    const challenge = "test-challenge-partial";
    let nonce = 0;
    // Find nonce for difficulty 4 (leading nibble = 0)
    while (nonce < 1_000_000) {
      const hash = crypto
        .createHash("sha256")
        .update(challenge + String(nonce))
        .digest();
      // First 4 bits must be zero → first byte <= 0x0F
      if ((hash[0]! & 0xf0) === 0) {
        expect(checkHash(challenge, String(nonce), 4)).toBe(true);
        return;
      }
      nonce++;
    }
    throw new Error("Could not find nonce");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Integration: PoW challenge / verify endpoints
// ══════════════════════════════════════════════════════════════════════

describe("PoW integration — challenge / verify flow", () => {
  let server: http.Server;
  let originalPow: boolean;

  beforeAll(async () => {
    await connectRedis();
    const rlKeys = await redisClient.keys("rl:*");
    if (rlKeys.length) await redisClient.del(rlKeys);
    await seedFromFile();

    // Enable PoW for this test suite
    originalPow = env.AUTH_POW_ENABLED;
    mutableEnv.AUTH_POW_ENABLED = true;
    mutableEnv.AUTH_POW_BASE_DIFFICULTY = 1; // very low for fast tests

    const app = createApp();
    server = app.listen(0);
  }, 30_000);

  afterAll(async () => {
    mutableEnv.AUTH_POW_ENABLED = originalPow;
    mutableEnv.AUTH_POW_BASE_DIFFICULTY = 18;
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    // Allow rate-limit-redis SCRIPT LOAD commands to complete
    await new Promise((r) => setTimeout(r, 50));
    await disconnectRedis();
    await pool.end();
  }, 10_000);

  it("GET /auth/pow-challenge — returns challenge, challengeId, difficulty", async () => {
    const res = await supertest(server).get("/api/v1/auth/pow-challenge");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.challengeId).toBeTruthy();
    expect(res.body.data.challenge).toBeTruthy();
    expect(typeof res.body.data.difficulty).toBe("number");
  });

  it("GET /config/client — exposes powEnabled and powBaseDifficulty", async () => {
    const res = await supertest(server).get("/api/v1/config/client");
    expect(res.status).toBe(200);
    expect(res.body.data.powEnabled).toBe(true);
    expect(typeof res.body.data.powBaseDifficulty).toBe("number");
    expect(res.body.data.turnstileSiteKey).toBeDefined();
  });

  it("register rejects request without PoW solution when PoW enabled", async () => {
    const agent = supertest.agent(server);
    const csrfRes = await agent.get("/api/v1/auth/csrf-token");
    const csrf = csrfRes.body.data.csrfToken;

    const res = await agent
      .post("/api/v1/auth/register/email/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({ email: `pow_missing_${Date.now()}@example.com` });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ROUND1_POW_REQUIRED");
  });

  it("register rejects invalid/expired PoW solution", async () => {
    const agent = supertest.agent(server);
    const csrfRes = await agent.get("/api/v1/auth/csrf-token");
    const csrf = csrfRes.body.data.csrfToken;

    const res = await agent
      .post("/api/v1/auth/register/email/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({
        email: `pow_invalid_${Date.now()}@example.com`,
        powSolution: {
          challengeId: crypto.randomUUID(),
          nonce: "0",
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ROUND1_POW_INVALID");
  });

  it("register accepts valid PoW solution", async () => {
    // 1. Get challenge
    const chalRes = await supertest(server).get("/api/v1/auth/pow-challenge");
    const { challengeId, challenge, difficulty } = chalRes.body.data;

    // 2. Solve it (difficulty=1, very fast)
    let nonce = 0;
    while (true) {
      const hash = crypto
        .createHash("sha256")
        .update(challenge + String(nonce))
        .digest();
      // Check leading zero bits
      let bits = 0;
      for (const byte of hash) {
        if (byte === 0) {
          bits += 8;
        } else {
          bits += Math.clz32(byte) - 24;
          break;
        }
      }
      if (bits >= difficulty) break;
      nonce++;
    }

    // 3. Submit with solution
    const agent = supertest.agent(server);
    const csrfRes = await agent.get("/api/v1/auth/csrf-token");
    const csrf = csrfRes.body.data.csrfToken;

    const res = await agent
      .post("/api/v1/auth/register/email/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({
        email: `pow_valid_${Date.now()}@example.com`,
        powSolution: { challengeId, nonce: String(nonce) },
      });

    // Should proceed past PoW check (200 = email challenge created)
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("PoW solution cannot be reused (replay protection)", async () => {
    // 1. Get challenge
    const chalRes = await supertest(server).get("/api/v1/auth/pow-challenge");
    const { challengeId, challenge, difficulty } = chalRes.body.data;

    // 2. Solve
    let nonce = 0;
    while (true) {
      const hash = crypto
        .createHash("sha256")
        .update(challenge + String(nonce))
        .digest();
      let bits = 0;
      for (const byte of hash) {
        if (byte === 0) {
          bits += 8;
        } else {
          bits += Math.clz32(byte) - 24;
          break;
        }
      }
      if (bits >= difficulty) break;
      nonce++;
    }

    const solution = { challengeId, nonce: String(nonce) };

    // 3. First use — should succeed
    const agent1 = supertest.agent(server);
    const csrf1Res = await agent1.get("/api/v1/auth/csrf-token");
    const csrf1 = csrf1Res.body.data.csrfToken;

    const res1 = await agent1
      .post("/api/v1/auth/register/email/request-challenge")
      .set("X-CSRF-Token", csrf1)
      .send({
        email: `pow_replay1_${Date.now()}@example.com`,
        powSolution: solution,
      });
    expect(res1.status).toBe(200);

    // 4. Replay — should fail (challenge deleted from Redis)
    const agent2 = supertest.agent(server);
    const csrf2Res = await agent2.get("/api/v1/auth/csrf-token");
    const csrf2 = csrf2Res.body.data.csrfToken;

    const res2 = await agent2
      .post("/api/v1/auth/register/email/request-challenge")
      .set("X-CSRF-Token", csrf2)
      .send({
        email: `pow_replay2_${Date.now()}@example.com`,
        powSolution: solution,
      });
    expect(res2.status).toBe(400);
    expect(res2.body.error.code).toBe("ROUND1_POW_INVALID");
  });

  it("login rejects request without PoW solution", async () => {
    const agent = supertest.agent(server);
    const csrfRes = await agent.get("/api/v1/auth/csrf-token");
    const csrf = csrfRes.body.data.csrfToken;

    const res = await agent
      .post("/api/v1/auth/login/password")
      .set("X-CSRF-Token", csrf)
      .send({ identifier: "someone", password: "something" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ROUND1_POW_REQUIRED");
  });

  it("password reset rejects request without PoW solution", async () => {
    const agent = supertest.agent(server);
    const csrfRes = await agent.get("/api/v1/auth/csrf-token");
    const csrf = csrfRes.body.data.csrfToken;

    const res = await agent
      .post("/api/v1/auth/password/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({ email: "test@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ROUND1_POW_REQUIRED");
  });
});
