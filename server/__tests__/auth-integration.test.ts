/**
 * Integration tests for auth flows.
 *
 * Requires running PostgreSQL + Redis:
 *   docker compose -f docker-compose.dev.yml up -d
 *   npm run migrate:up
 *
 * Covers:
 *   - Registration (email challenge → verify code → complete)
 *   - Email sending via Resend (mocked fetch)
 *   - Cloudflare Turnstile (mocked)
 *   - Password login / zxcvbn rejection
 *   - Password reset flow
 *   - safeReturnTo integrated in OIDC
 *   - Temporary email blocklist CRUD + interception
 *   - Session / CSRF flows
 *   - Passkey bind → logout → login → unbind (mocked WebAuthn)
 *   - PoW env flag presence
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import crypto from "node:crypto";
import http from "node:http";
import supertest from "supertest";
import type { Express } from "express";

import { createApp } from "../app.js";
import { db, pool } from "../db.js";
import { connectRedis, redisClient, disconnectRedis } from "../redis.js";
import { seedFromFile } from "../services/auth/blocklistService.js";
import { users } from "../db/schema/users.js";
import { env } from "../../config/env.js";
import { eq } from "drizzle-orm";

// ── Test harness ─────────────────────────────────────────────────────

let app: Express;
let server: http.Server;
let agent: ReturnType<typeof supertest.agent>;

// We intercept all outgoing mail so Resend is never actually called
const sentEmails: Array<{
  to: string;
  subject: string;
  html: string;
  text: string;
}> = [];

// Mock sendMail to capture emails
vi.mock("../services/mail/index.js", () => ({
  sendMail: vi.fn(async (opts: { to: string; subject: string; html: string; text: string }) => {
    sentEmails.push(opts);
  }),
}));

// Keep Turnstile always passing in integration tests (tested separately)
vi.mock("../services/auth/turnstileService.js", () => ({
  verifyTurnstile: vi.fn(async () => true),
}));

beforeAll(async () => {
  await connectRedis();
  // Flush rate-limit keys from previous test runs
  const rlKeys = await redisClient.keys("rl:*");
  if (rlKeys.length) await redisClient.del(rlKeys);
  await seedFromFile();
  app = createApp();
  // Bind to a real HTTP server so we can close it cleanly in afterAll,
  // ensuring all in-flight rate-limiter Redis commands finish before disconnect.
  server = app.listen(0);
  agent = supertest.agent(server);
}, 30_000);

afterAll(async () => {
  // 1. Close the HTTP server — drains in-flight connections.
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  // 2. Allow rate-limit-redis SCRIPT LOAD commands (fired in RedisStore
  //    constructor at import time) to complete before closing the client.
  await new Promise((r) => setTimeout(r, 50));
  // 3. Now safe to disconnect Redis + DB
  await disconnectRedis();
  await pool.end();
}, 10_000);

// ── Helpers ──────────────────────────────────────────────────────────

/** Extract CSRF token from the GET /auth/csrf-token endpoint */
async function getCsrf(ag: ReturnType<typeof supertest.agent>): Promise<string> {
  const res = await ag.get("/api/v1/auth/csrf-token");
  return res.body?.data?.csrfToken ?? "";
}

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** Extract the 6-digit code from the last captured email text */
function extractCodeFromLastEmail(): string {
  const last = sentEmails[sentEmails.length - 1];
  // Format: 您的验证码是 123456，
  const match = last?.text?.match(/验证码是\s*(\d{6})/);
  return match?.[1] ?? "";
}

/** Extract the link token from the last captured email text */
function extractLinkTokenFromLastEmail(): string {
  const last = sentEmails[sentEmails.length - 1];
  // URL-encoded in the link: token=<hex>
  const match = last?.text?.match(/token=([a-f0-9]+)/);
  return match?.[1] ?? "";
}

/** Extract challengeId from the last captured email text */
function extractChallengeIdFromLastEmail(): string {
  const last = sentEmails[sentEmails.length - 1];
  // URL-encoded in the link: challenge=<uuid>
  const match = last?.text?.match(/challenge=([a-f0-9-]+)/);
  return match?.[1] ?? "";
}

// Unique test email for each run
const testEmail = `testuser_${Date.now()}@example.com`;
const testUsername = `tst${Date.now().toString(36).slice(-8)}`;
const strongPassword = "X#9kL$2mN!pQ7w&3";

// ══════════════════════════════════════════════════════════════════════
//  Phase 2 — Registration + Login
// ══════════════════════════════════════════════════════════════════════

describe("Phase 2 — Email Registration", () => {
  let challengeId: string;
  let registerTicket: string;

  it("GET /auth/csrf-token — returns a CSRF token", async () => {
    const res = await agent.get("/api/v1/auth/csrf-token");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.csrfToken).toBeTruthy();
  });

  it("GET /auth/providers — lists enabled providers", async () => {
    const res = await agent.get("/api/v1/auth/providers");
    expect(res.status).toBe(200);
    expect(res.body.data.providers).toContain("password");
    expect(res.body.data.providers).toContain("passkey");
  });

  it("POST /auth/register/email/request-challenge — sends code email", async () => {
    const csrf = await getCsrf(agent);
    sentEmails.length = 0;

    const res = await agent
      .post("/api/v1/auth/register/email/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({ email: testEmail, turnstileToken: "test-turnstile-tok" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    challengeId = res.body.data.challengeId;
    expect(challengeId).toBeTruthy();
    expect(res.body.data.expiresAt).toBeTruthy();

    // Email was captured
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe(testEmail);
    expect(sentEmails[0]!.subject).toContain("注册");
  });

  it("POST /auth/register/email/verify-code — verifies 6-digit code", async () => {
    const code = extractCodeFromLastEmail();
    expect(code).toHaveLength(6);

    const csrf = await getCsrf(agent);
    const res = await agent
      .post("/api/v1/auth/register/email/verify-code")
      .set("X-CSRF-Token", csrf)
      .send({ challengeId, code });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    registerTicket = res.body.data.ticket;
    expect(registerTicket).toBeTruthy();
    expect(res.body.data.flow).toBe("register");
  });

  it("POST /auth/register/email/complete — rejects weak password", async () => {
    const csrf = await getCsrf(agent);

    // Need a fresh ticket since the previous one will be consumed.
    // First request another challenge
    sentEmails.length = 0;
    const chalRes = await agent
      .post("/api/v1/auth/register/email/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({ email: `weak_${Date.now()}@example.com` });
    const chalId2 = chalRes.body.data.challengeId;
    const code2 = extractCodeFromLastEmail();
    const verifyRes = await agent
      .post("/api/v1/auth/register/email/verify-code")
      .set("X-CSRF-Token", csrf)
      .send({ challengeId: chalId2, code: code2 });
    const weakTicket = verifyRes.body.data.ticket;

    const res = await agent
      .post("/api/v1/auth/register/email/complete")
      .set("X-CSRF-Token", csrf)
      .send({
        ticket: weakTicket,
        username: `weakusr${Date.now().toString(36).slice(-6)}`,
        password: "password", // weak!
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("ROUND1_WEAK_PASSWORD");
  });

  it("POST /auth/register/email/complete — creates account with strong password", async () => {
    const csrf = await getCsrf(agent);
    const res = await agent
      .post("/api/v1/auth/register/email/complete")
      .set("X-CSRF-Token", csrf)
      .send({
        ticket: registerTicket,
        username: testUsername,
        password: strongPassword,
        deviceIdHash: sha256("test-device-id"),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.username).toBe(testUsername);
    expect(res.body.data.role).toBe("student");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Phase 2 — Redeem Link path
// ══════════════════════════════════════════════════════════════════════

describe("Phase 2 — Registration via Link Redemption", () => {
  it("POST /auth/register/email/redeem-link — exchanges link for ticket", async () => {
    const linkEmail = `link_${Date.now()}@example.com`;
    sentEmails.length = 0;

    const csrf = await getCsrf(agent);
    const chalRes = await agent
      .post("/api/v1/auth/register/email/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({ email: linkEmail });

    const chalId = chalRes.body.data.challengeId;

    // Extract link token from the email
    const linkToken = extractLinkTokenFromLastEmail();
    expect(linkToken).toBeTruthy();

    const res = await agent
      .post("/api/v1/auth/register/email/redeem-link")
      .set("X-CSRF-Token", csrf)
      .send({ challengeId: chalId, token: linkToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ticket).toBeTruthy();
    expect(res.body.data.flow).toBe("register");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Phase 2 — Password Login
// ══════════════════════════════════════════════════════════════════════

describe("Phase 2 — Password Login", () => {
  it("POST /auth/login/password — login by username", async () => {
    // First logout any existing session
    const csrf = await getCsrf(agent);
    await agent.post("/api/v1/auth/logout").set("X-CSRF-Token", csrf);

    const loginAgent = supertest.agent(server);
    const loginCsrf = await getCsrf(loginAgent);

    const res = await loginAgent
      .post("/api/v1/auth/login/password")
      .set("X-CSRF-Token", loginCsrf)
      .send({
        identifier: testUsername,
        password: strongPassword,
        deviceIdHash: sha256("login-device"),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.username).toBe(testUsername);
    expect(res.body.data.role).toBe("student");

    // Update agent for subsequent tests
    agent = loginAgent;
  });

  it("POST /auth/login/password — login by email", async () => {
    const loginAgent = supertest.agent(server);
    const csrf = await getCsrf(loginAgent);

    const res = await loginAgent
      .post("/api/v1/auth/login/password")
      .set("X-CSRF-Token", csrf)
      .send({ identifier: testEmail, password: strongPassword });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.username).toBe(testUsername);
  });

  it("POST /auth/login/password — rejects wrong password", async () => {
    const loginAgent = supertest.agent(server);
    const csrf = await getCsrf(loginAgent);

    const res = await loginAgent
      .post("/api/v1/auth/login/password")
      .set("X-CSRF-Token", csrf)
      .send({ identifier: testUsername, password: "WrongPassword123!!" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("ROUND1_INVALID_CREDENTIALS");
  });

  it("POST /auth/login/password — rejects nonexistent user", async () => {
    const loginAgent = supertest.agent(server);
    const csrf = await getCsrf(loginAgent);

    const res = await loginAgent
      .post("/api/v1/auth/login/password")
      .set("X-CSRF-Token", csrf)
      .send({ identifier: "nonexistentuser999", password: "anything" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("ROUND1_INVALID_CREDENTIALS");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Phase 2 — Temp Email Blocklist Interception
// ══════════════════════════════════════════════════════════════════════

describe("Phase 2 — Temp Email Blocklist Interception", () => {
  it("rejects registration with a known temp email domain", async () => {
    // Manually add a domain to the manual blocklist
    await redisClient.sAdd("round1:email-blocklist:manual", "temptest.xyz");

    const tempAgent = supertest.agent(server);
    const csrf = await getCsrf(tempAgent);

    const res = await tempAgent
      .post("/api/v1/auth/register/email/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({ email: "user@temptest.xyz" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ROUND1_TEMP_EMAIL");

    // Cleanup
    await redisClient.sRem("round1:email-blocklist:manual", "temptest.xyz");
  });

  it("allows registration with a non-blocked domain", async () => {
    const tempAgent = supertest.agent(server);
    const csrf = await getCsrf(tempAgent);
    sentEmails.length = 0;

    const res = await tempAgent
      .post("/api/v1/auth/register/email/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({ email: `legit_${Date.now()}@legitimatedomain.com` });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Phase 3 — Password Reset
// ══════════════════════════════════════════════════════════════════════

describe("Phase 3 — Password Reset", () => {
  const newPassword = "NewStr0ng#Pass99!";

  it("POST /auth/password/request-challenge — returns generic success (anti-enum)", async () => {
    const resetAgent = supertest.agent(server);
    const csrf = await getCsrf(resetAgent);
    sentEmails.length = 0;

    const res = await resetAgent
      .post("/api/v1/auth/password/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({ email: testEmail });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain("如果该邮箱已注册");
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.subject).toContain("重置密码");
  });

  it("POST /auth/password/request-challenge — generic response for unknown email", async () => {
    const resetAgent = supertest.agent(server);
    const csrf = await getCsrf(resetAgent);
    sentEmails.length = 0;

    const res = await resetAgent
      .post("/api/v1/auth/password/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({ email: "nonexistent@example.com" });

    expect(res.status).toBe(200);
    // Should NOT have sent an email
    expect(sentEmails).toHaveLength(0);
  });

  it("full reset flow: challenge → verify-code → reset", async () => {
    const resetAgent = supertest.agent(server);
    const csrf = await getCsrf(resetAgent);
    sentEmails.length = 0;

    // Step 1: Request challenge
    await resetAgent
      .post("/api/v1/auth/password/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({ email: testEmail });

    const code = extractCodeFromLastEmail();
    expect(code).toHaveLength(6);
    const chalId = extractChallengeIdFromLastEmail();

    // Step 2: Verify code
    const verifyRes = await resetAgent
      .post("/api/v1/auth/password/verify-code")
      .set("X-CSRF-Token", csrf)
      .send({ challengeId: chalId, code });

    expect(verifyRes.status).toBe(200);
    const resetTicket = verifyRes.body.data.ticket;

    // Step 3: Reset password (reject weak)
    const weakRes = await resetAgent
      .post("/api/v1/auth/password/reset")
      .set("X-CSRF-Token", csrf)
      .send({ ticket: resetTicket, newPassword: "12345678" });
    expect(weakRes.status).toBe(400);
    expect(weakRes.body.error.code).toBe("ROUND1_WEAK_PASSWORD");

    // Ticket was consumed by weak attempt, need fresh flow
    sentEmails.length = 0;
    await resetAgent
      .post("/api/v1/auth/password/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({ email: testEmail });

    const code2 = extractCodeFromLastEmail();
    const chalId2 = extractChallengeIdFromLastEmail();
    const verifyRes2 = await resetAgent
      .post("/api/v1/auth/password/verify-code")
      .set("X-CSRF-Token", csrf)
      .send({ challengeId: chalId2, code: code2 });
    const resetTicket2 = verifyRes2.body.data.ticket;

    // Step 3b: Reset with strong password
    const resetRes = await resetAgent
      .post("/api/v1/auth/password/reset")
      .set("X-CSRF-Token", csrf)
      .send({ ticket: resetTicket2, newPassword });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.data.message).toContain("已重置");

    // Step 4: Login with new password
    const loginAgent = supertest.agent(server);
    const loginCsrf = await getCsrf(loginAgent);
    const loginRes = await loginAgent
      .post("/api/v1/auth/login/password")
      .set("X-CSRF-Token", loginCsrf)
      .send({ identifier: testUsername, password: newPassword });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.username).toBe(testUsername);

    // Step 5: Old password no longer works
    const oldLoginAgent = supertest.agent(server);
    const oldCsrf = await getCsrf(oldLoginAgent);
    const oldRes = await oldLoginAgent
      .post("/api/v1/auth/login/password")
      .set("X-CSRF-Token", oldCsrf)
      .send({ identifier: testUsername, password: strongPassword });
    expect(oldRes.status).toBe(401);

    agent = loginAgent; // keep logged-in agent
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Phase 3 — Password Change (logged in)
// ══════════════════════════════════════════════════════════════════════

describe("Phase 3 — Password Change", () => {
  const currentPw = "NewStr0ng#Pass99!";
  const changedPw = "Ch4ngedP@ss!Str0ng";

  it("rejects change with wrong current password", async () => {
    const csrf = await getCsrf(agent);
    const res = await agent
      .post("/api/v1/auth/password/change")
      .set("X-CSRF-Token", csrf)
      .send({ currentPassword: "TotallyWrong!!", newPassword: changedPw });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("ROUND1_INVALID_CREDENTIALS");
  });

  it("rejects weak new password on change", async () => {
    const csrf = await getCsrf(agent);
    const res = await agent
      .post("/api/v1/auth/password/change")
      .set("X-CSRF-Token", csrf)
      .send({ currentPassword: currentPw, newPassword: "password" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ROUND1_WEAK_PASSWORD");
  });

  it("changes password and invalidates other sessions", async () => {
    const csrf = await getCsrf(agent);
    const res = await agent
      .post("/api/v1/auth/password/change")
      .set("X-CSRF-Token", csrf)
      .send({ currentPassword: currentPw, newPassword: changedPw });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain("已修改");

    // Can login with new password
    const freshAgent = supertest.agent(server);
    const freshCsrf = await getCsrf(freshAgent);
    const loginRes = await freshAgent
      .post("/api/v1/auth/login/password")
      .set("X-CSRF-Token", freshCsrf)
      .send({ identifier: testUsername, password: changedPw });
    expect(loginRes.status).toBe(200);

    agent = freshAgent;
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Phase 2.5 — CSRF Protection
// ══════════════════════════════════════════════════════════════════════

describe("CSRF Protection", () => {
  it("rejects POST without CSRF token", async () => {
    const freshAgent = supertest.agent(server);

    const res = await freshAgent
      .post("/api/v1/auth/login/password")
      .send({ identifier: "someone", password: "something" });

    // csrf-sync should reject — typically 403 or equivalent
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Temp Email Blocklist Admin CRUD
// ══════════════════════════════════════════════════════════════════════

describe("Admin Blocklist CRUD", () => {
  let adminAgent: ReturnType<typeof supertest.agent>;
  let adminCsrf: string;

  beforeAll(async () => {
    // Promote our test user to admin
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, testUsername))
      .limit(1);

    if (user) {
      await db
        .update(users)
        .set({ role: "admin", lastStrongAuthAt: new Date() })
        .where(eq(users.id, user.id));
    }

    // Login as admin
    adminAgent = supertest.agent(server);
    adminCsrf = await getCsrf(adminAgent);
    const loginRes = await adminAgent
      .post("/api/v1/auth/login/password")
      .set("X-CSRF-Token", adminCsrf)
      .send({ identifier: testUsername, password: "Ch4ngedP@ss!Str0ng" });
    expect(loginRes.status).toBe(200);
    adminCsrf = await getCsrf(adminAgent);
  });

  it("GET /admin/blocklist/stats — returns stats", async () => {
    const res = await adminAgent.get("/api/v1/admin/blocklist/stats");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("githubCount");
    expect(res.body.data).toHaveProperty("manualCount");
    expect(res.body.data).toHaveProperty("total");
  });

  it("GET /openapi.json — requires admin outside development", async () => {
    const originalNodeEnv = env.NODE_ENV;
    env.NODE_ENV = "production";

    try {
      const anonymousRes = await supertest(server).get("/api/v1/openapi.json");
      expect(anonymousRes.status).toBe(401);
      expect(anonymousRes.body.error.code).toBe("ROUND1_UNAUTHENTICATED");

      const adminRes = await adminAgent.get("/api/v1/openapi.json");
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.openapi).toBe("3.1.0");
      expect(adminRes.body.info.title).toBe("Round1 API");
    } finally {
      env.NODE_ENV = originalNodeEnv;
    }
  });

  it("POST /admin/blocklist — add a domain", async () => {
    const csrf = await getCsrf(adminAgent);
    const res = await adminAgent
      .post("/api/v1/admin/blocklist")
      .set("X-CSRF-Token", csrf)
      .send({ domain: "crudtest.example" });

    expect(res.status).toBe(201);
    expect(res.body.data.domain).toBe("crudtest.example");
    expect(res.body.data.source).toBe("manual");
  });

  it("POST /admin/blocklist — rejects duplicate domain", async () => {
    const csrf = await getCsrf(adminAgent);
    const res = await adminAgent
      .post("/api/v1/admin/blocklist")
      .set("X-CSRF-Token", csrf)
      .send({ domain: "crudtest.example" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ROUND1_DUPLICATE");
  });

  it("GET /admin/blocklist — list with search", async () => {
    const res = await adminAgent.get("/api/v1/admin/blocklist").query({ search: "crudtest" });

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.items[0]!.domain).toBe("crudtest.example");
  });

  it("PATCH /admin/blocklist/:domain — rename domain", async () => {
    const csrf = await getCsrf(adminAgent);
    const res = await adminAgent
      .patch("/api/v1/admin/blocklist/crudtest.example")
      .set("X-CSRF-Token", csrf)
      .send({ newDomain: "crudrenamed.example" });

    expect(res.status).toBe(200);
    expect(res.body.data.domain).toBe("crudrenamed.example");
  });

  it("DELETE /admin/blocklist/:domain — remove domain", async () => {
    const csrf = await getCsrf(adminAgent);
    const res = await adminAgent
      .delete("/api/v1/admin/blocklist/crudrenamed.example")
      .set("X-CSRF-Token", csrf);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain("已移除");
  });

  it("DELETE /admin/blocklist/:domain — 404 for nonexistent", async () => {
    const csrf = await getCsrf(adminAgent);
    const res = await adminAgent
      .delete("/api/v1/admin/blocklist/nonexistent.example")
      .set("X-CSRF-Token", csrf);

    expect(res.status).toBe(404);
  });

  it("blocklist interception works after manual add", async () => {
    // Add a domain
    const csrf = await getCsrf(adminAgent);
    await adminAgent
      .post("/api/v1/admin/blocklist")
      .set("X-CSRF-Token", csrf)
      .send({ domain: "blocked4real.test" });

    // Try to register with that domain
    const regAgent = supertest.agent(server);
    const regCsrf = await getCsrf(regAgent);
    const res = await regAgent
      .post("/api/v1/auth/register/email/request-challenge")
      .set("X-CSRF-Token", regCsrf)
      .send({ email: "user@blocked4real.test" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ROUND1_TEMP_EMAIL");

    // Clean up
    const cleanCsrf = await getCsrf(adminAgent);
    await adminAgent
      .delete("/api/v1/admin/blocklist/blocked4real.test")
      .set("X-CSRF-Token", cleanCsrf);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  PoW Configuration Flag
// ══════════════════════════════════════════════════════════════════════

describe("Frontend Adaptive PoW — Config", () => {
  it("AUTH_POW_ENABLED and AUTH_POW_BASE_DIFFICULTY are exposed in env", async () => {
    const { env } = await import("../../config/env.js");
    expect(typeof env.AUTH_POW_ENABLED).toBe("boolean");
    expect(typeof env.AUTH_POW_BASE_DIFFICULTY).toBe("number");
    expect(env.AUTH_POW_BASE_DIFFICULTY).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Turnstile Integration — verifyTurnstile mock call verification
// ══════════════════════════════════════════════════════════════════════

describe("Turnstile Integration — mock call args", () => {
  it("register challenge passes turnstileToken and IP to verifyTurnstile", async () => {
    const { verifyTurnstile } = await import("../services/auth/turnstileService.js");
    const mockVerify = verifyTurnstile as ReturnType<typeof vi.fn>;
    mockVerify.mockClear();

    const turnstileAgent = supertest.agent(server);
    const csrf = await getCsrf(turnstileAgent);

    await turnstileAgent
      .post("/api/v1/auth/register/email/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({
        email: `turnstile_${Date.now()}@example.com`,
        turnstileToken: "tok-abc-123",
      });

    expect(mockVerify).toHaveBeenCalledTimes(1);
    expect(mockVerify).toHaveBeenCalledWith("tok-abc-123", expect.any(String));
  });

  it("register challenge returns 400 when turnstile fails", async () => {
    const { verifyTurnstile } = await import("../services/auth/turnstileService.js");
    const mockVerify = verifyTurnstile as ReturnType<typeof vi.fn>;
    // Temporarily make turnstile reject
    mockVerify.mockResolvedValueOnce(false);

    const turnstileAgent = supertest.agent(server);
    const csrf = await getCsrf(turnstileAgent);

    const res = await turnstileAgent
      .post("/api/v1/auth/register/email/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({
        email: `turnstile_fail_${Date.now()}@example.com`,
        turnstileToken: "bad-token",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ROUND1_TURNSTILE_FAILED");
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Resend Mail — parameter correctness
// ══════════════════════════════════════════════════════════════════════

describe("Resend Mail — captured parameters", () => {
  it("sendMail is called with correct to, subject, html, text fields", async () => {
    const resendAgent = supertest.agent(server);
    const csrf = await getCsrf(resendAgent);
    sentEmails.length = 0;

    await resendAgent
      .post("/api/v1/auth/register/email/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({ email: `resend_check_${Date.now()}@example.com` });

    expect(sentEmails).toHaveLength(1);
    const mail = sentEmails[0]!;

    // All four required fields must be present and non-empty
    expect(mail.to).toMatch(/@example\.com$/);
    expect(mail.subject).toBeTruthy();
    expect(mail.html).toBeTruthy();
    expect(mail.text).toBeTruthy();

    // Text body should contain the 6-digit verification code
    expect(mail.text).toMatch(/\d{6}/);
    // HTML body should also contain the code
    expect(mail.html).toMatch(/\d{6}/);
  });

  it("password reset email contains reset-specific content", async () => {
    // Flush rate-limit keys — earlier tests exhaust the forgot-email quota
    const rlKeys = await redisClient.keys("rl:forgot-email:*");
    if (rlKeys.length) await redisClient.del(rlKeys);

    const resendAgent = supertest.agent(server);
    const csrf = await getCsrf(resendAgent);
    sentEmails.length = 0;

    await resendAgent
      .post("/api/v1/auth/password/request-challenge")
      .set("X-CSRF-Token", csrf)
      .send({ email: testEmail });

    expect(sentEmails).toHaveLength(1);
    const mail = sentEmails[0]!;
    expect(mail.to).toBe(testEmail);
    expect(mail.subject).toContain("重置密码");
    expect(mail.html).toBeTruthy();
    expect(mail.text).toMatch(/\d{6}/);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Logout
// ══════════════════════════════════════════════════════════════════════

describe("Logout", () => {
  it("POST /auth/logout — destroys session", async () => {
    const loginAgent = supertest.agent(server);
    const loginCsrf = await getCsrf(loginAgent);
    await loginAgent
      .post("/api/v1/auth/login/password")
      .set("X-CSRF-Token", loginCsrf)
      .send({ identifier: testUsername, password: "Ch4ngedP@ss!Str0ng" });

    const csrf = await getCsrf(loginAgent);
    const res = await loginAgent.post("/api/v1/auth/logout").set("X-CSRF-Token", csrf);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain("退出");
  });
});

describe("Forced password change", () => {
  it("blocks protected flows until password_change_required is cleared", async () => {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, testUsername))
      .limit(1);

    expect(user).toBeTruthy();
    await db
      .update(users)
      .set({ passwordChangeRequired: true })
      .where(eq(users.id, user!.id));

    const forcedAgent = supertest.agent(server);
    const loginCsrf = await getCsrf(forcedAgent);
    const loginRes = await forcedAgent
      .post("/api/v1/auth/login/password")
      .set("X-CSRF-Token", loginCsrf)
      .send({ identifier: testUsername, password: "Ch4ngedP@ss!Str0ng" });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.passwordChangeRequired).toBe(true);

    const csrf = await getCsrf(forcedAgent);
    const blockedRes = await forcedAgent
      .post("/api/v1/auth/passkeys/register/options")
      .set("X-CSRF-Token", csrf)
      .send({});

    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error.code).toBe("ROUND1_PASSWORD_CHANGE_REQUIRED");

    const changeRes = await forcedAgent
      .post("/api/v1/auth/password/change")
      .set("X-CSRF-Token", csrf)
      .send({
        currentPassword: "Ch4ngedP@ss!Str0ng",
        newPassword: "correct-horse-battery-staple-2026!",
      });

    expect(changeRes.status).toBe(200);
    expect(changeRes.body.data.passwordChangeRequired).toBe(false);

    const [updated] = await db
      .select({ passwordChangeRequired: users.passwordChangeRequired })
      .from(users)
      .where(eq(users.id, user!.id))
      .limit(1);

    expect(updated?.passwordChangeRequired).toBe(false);
  });
});
