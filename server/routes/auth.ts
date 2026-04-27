import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import argon2 from "argon2";
import zxcvbn from "zxcvbn";

import { db } from "../db.js";
import { env } from "../../config/env.js";
import { csrfGenerateToken } from "../app.js";
import { AppError } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { verifyTurnstile } from "../services/auth/turnstileService.js";
import {
  createPowChallenge,
  verifyPowSolution,
} from "../services/auth/powService.js";
import {
  createChallenge,
  verifyCode,
  redeemLink,
  consumeTicket,
} from "../services/auth/emailService.js";
import {
  generateTotpSecret,
  encryptTotpSecret,
  decryptTotpSecret,
  verifyTotp,
} from "../services/auth/totpService.js";
import { requireRecentAuth } from "../middleware/requireRecentAuth.js";
import { users } from "../db/schema/users.js";
import { userEmails } from "../db/schema/userEmails.js";
import { authAuditLogs } from "../db/schema/authAuditLogs.js";
import { externalIdentities } from "../db/schema/externalIdentities.js";
import {
  RegisterRequestChallengeBody,
  VerifyCodeBody,
  RedeemLinkBody,
  RegisterCompleteBody,
  PasswordLoginBody,
  PasswordResetRequestBody,
  PasswordResetBody,
  PasswordChangeBody,
  EmailChangeRequestBody,
  EmailChangeConfirmBody,
  CompleteProfileBody,
  PasskeyLoginVerifyBody,
  PasskeyRegisterVerifyBody,
  PasswordReauthBody,
  TotpEnrollVerifyBody,
  TotpReauthBody,
} from "./schemas/auth.schema.js";
import { safeReturnTo } from "../../config/auth.js";
import {
  challengePerEmailLimiter,
  challengePerIpLimiter,
  loginPerAccountLimiter,
  loginPerDeviceLimiter,
  forgotPerEmailLimiter,
  registerPerIpLimiter,
} from "../middleware/authRateLimit.js";
import {
  buildAuthorizationUrl,
  handleCallback,
} from "../services/auth/oidcService.js";
import { isTempEmail } from "../services/auth/blocklistService.js";
import { passkeyCredentials } from "../db/schema/passkeyCredentials.js";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";

// ── Helpers ──────────────────────────────────────────────────────────

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    const data = { ...req.session } as Record<string, unknown>;
    delete data.cookie;
    req.session.regenerate((err) => {
      if (err) return reject(err);
      Object.assign(req.session, data);
      resolve();
    });
  });
}

async function writeAuditLog(opts: {
  userId?: string;
  action: string;
  identifier?: string;
  provider?: string;
  ip: string;
  deviceIdHash?: string;
  result: string;
}) {
  await db.insert(authAuditLogs).values({
    userId: opts.userId ?? null,
    action: opts.action,
    identifierHash: opts.identifier ? sha256(opts.identifier) : null,
    provider: opts.provider ?? null,
    ip: opts.ip,
    deviceIdHash: opts.deviceIdHash ?? null,
    result: opts.result,
  });
}

// ── Router ───────────────────────────────────────────────────────────

export const authRouter = Router();

// ─── Phase 2: Register + Login ───────────────────────────────────────

// 1. GET /auth/csrf-token
authRouter.get(
  "/auth/csrf-token",
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const csrfToken = csrfGenerateToken(req);
      res.ok({ csrfToken });
    } catch (err) {
      next(err);
    }
  },
);

// 2. GET /auth/providers
authRouter.get("/auth/providers", (_req: Request, res: Response) => {
  const providers: string[] = ["password", "passkey"];
  if (env.CPPLEARN_OIDC_ISSUER) {
    providers.push("cpplearn");
  }
  if (env.AUTH_PROVIDER_QQ_ENABLED) {
    providers.push("qq");
  }
  res.ok({ providers });
});

// 2b. GET /auth/pow-challenge — issue a PoW challenge
authRouter.get(
  "/auth/pow-challenge",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!env.AUTH_POW_ENABLED) {
        res.fail("ROUND1_POW_DISABLED", "PoW is not enabled", 400);
        return;
      }
      const challenge = await createPowChallenge();
      res.ok(challenge);
    } catch (err) {
      next(err);
    }
  },
);

// 3. POST /auth/register/email/request-challenge
authRouter.post(
  "/auth/register/email/request-challenge",
  challengePerEmailLimiter,
  challengePerIpLimiter,
  validate(RegisterRequestChallengeBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, turnstileToken, powSolution } = req.body;

      // PoW check
      if (env.AUTH_POW_ENABLED) {
        if (!powSolution) {
          res.fail("ROUND1_POW_REQUIRED", "需要完成工作量证明", 400);
          return;
        }
        const powOk = await verifyPowSolution(powSolution);
        if (!powOk) {
          res.fail("ROUND1_POW_INVALID", "工作量证明无效或已过期", 400);
          return;
        }
      }

      // Turnstile check
      if (turnstileToken) {
        const ok = await verifyTurnstile(turnstileToken, req.ip!);
        if (!ok) {
          res.fail("ROUND1_TURNSTILE_FAILED", "人机验证失败，请重试", 400);
          return;
        }
      }

      // Temp email blocklist
      if (await isTempEmail(email)) {
        res.fail("ROUND1_TEMP_EMAIL", "不支持临时邮箱注册", 400);
        return;
      }

      // Check email already registered
      const [existing] = await db
        .select({ id: userEmails.id })
        .from(userEmails)
        .where(eq(userEmails.email, email))
        .limit(1);

      if (existing) {
        res.fail("ROUND1_EMAIL_TAKEN", "该邮箱已注册", 409);
        return;
      }

      const result = await createChallenge({ flow: "register", email });
      res.ok({ challengeId: result.challengeId, expiresAt: result.expiresAt });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 4. POST /auth/register/email/verify-code
authRouter.post(
  "/auth/register/email/verify-code",
  validate(VerifyCodeBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { challengeId, code } = req.body;
      const result = await verifyCode({ challengeId, code });
      res.ok({ ticket: result.ticket, flow: result.flow });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 5. POST /auth/register/email/redeem-link
authRouter.post(
  "/auth/register/email/redeem-link",
  validate(RedeemLinkBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { challengeId, token } = req.body;
      const result = await redeemLink({ challengeId, token });
      res.ok({ ticket: result.ticket, flow: result.flow });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 6. POST /auth/register/email/complete
authRouter.post(
  "/auth/register/email/complete",
  registerPerIpLimiter,
  validate(RegisterCompleteBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ticket, username, password, displayName, deviceIdHash } = req.body;

      // Consume the register ticket
      const ticketData = await consumeTicket({ ticket, flow: "register" });
      const email = ticketData.email;

      // Double-check email not taken
      const [emailExists] = await db
        .select({ id: userEmails.id })
        .from(userEmails)
        .where(eq(userEmails.email, email))
        .limit(1);

      if (emailExists) {
        res.fail("ROUND1_EMAIL_TAKEN", "该邮箱已注册", 409);
        return;
      }

      // zxcvbn password strength check
      const strength = zxcvbn(password);
      if (strength.score < 3) {
        res.fail("ROUND1_WEAK_PASSWORD", "密码强度不足，请使用更复杂的密码", 400);
        return;
      }

      // Check username not taken
      const [usernameExists] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (usernameExists) {
        res.fail("ROUND1_USERNAME_TAKEN", "该用户名已被占用", 409);
        return;
      }

      // Hash password
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

      // Create user + userEmail in a transaction
      const user = await db.transaction(async (tx) => {
        const [newUser] = await tx
          .insert(users)
          .values({
            username,
            displayName: displayName ?? username,
            passwordHash,
          })
          .returning({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            role: users.role,
            sessionVersion: users.sessionVersion,
          });

        if (!newUser) throw new AppError("ROUND1_INTERNAL_ERROR", "创建用户失败", 500);

        await tx.insert(userEmails).values({
          userId: newUser.id,
          email,
          verifiedAt: new Date(),
          source: "registration",
        });

        return newUser;
      });

      if (!user) throw new AppError("ROUND1_INTERNAL_ERROR", "创建用户失败", 500);

      // Regenerate session
      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.sessionVersion = user.sessionVersion;
      req.session.createdAt = Date.now();
      req.session.lastStrongAuthAt = Date.now();

      // Audit log
      await writeAuditLog({
        userId: user.id,
        action: "register",
        identifier: email,
        ip: req.ip!,
        deviceIdHash,
        result: "success",
      });

      res.ok({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 7. POST /auth/login/password
authRouter.post(
  "/auth/login/password",
  loginPerAccountLimiter,
  loginPerDeviceLimiter,
  validate(PasswordLoginBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identifier, password, deviceIdHash, powSolution } = req.body;

      // PoW check
      if (env.AUTH_POW_ENABLED) {
        if (!powSolution) {
          res.fail("ROUND1_POW_REQUIRED", "需要完成工作量证明", 400);
          return;
        }
        const powOk = await verifyPowSolution(powSolution);
        if (!powOk) {
          res.fail("ROUND1_POW_INVALID", "工作量证明无效或已过期", 400);
          return;
        }
      }

      // Try to find user by email first, then by username
      let user: {
        id: string;
        username: string;
        displayName: string;
        passwordHash: string | null;
        role: string;
        sessionVersion: number;
        status: string;
      } | null = null;

      // Try email lookup
      const [emailRow] = await db
        .select({ userId: userEmails.userId })
        .from(userEmails)
        .where(eq(userEmails.email, identifier))
        .limit(1);

      if (emailRow) {
        const [u] = await db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            passwordHash: users.passwordHash,
            role: users.role,
            sessionVersion: users.sessionVersion,
            status: users.status,
          })
          .from(users)
          .where(eq(users.id, emailRow.userId))
          .limit(1);
        user = u ?? null;
      } else {
        // Try username lookup
        const [u] = await db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            passwordHash: users.passwordHash,
            role: users.role,
            sessionVersion: users.sessionVersion,
            status: users.status,
          })
          .from(users)
          .where(eq(users.username, identifier))
          .limit(1);
        user = u ?? null;
      }

      if (!user || user.status === "deleted") {
        await writeAuditLog({
          action: "login",
          identifier,
          provider: "password",
          ip: req.ip!,
          deviceIdHash,
          result: "fail_not_found",
        });
        res.fail("ROUND1_INVALID_CREDENTIALS", "用户名或密码错误", 401);
        return;
      }

      if (!user.passwordHash) {
        await writeAuditLog({
          userId: user.id,
          action: "login",
          identifier,
          provider: "password",
          ip: req.ip!,
          deviceIdHash,
          result: "fail_no_password",
        });
        res.fail("ROUND1_INVALID_CREDENTIALS", "用户名或密码错误", 401);
        return;
      }

      const valid = await argon2.verify(user.passwordHash, password);
      if (!valid) {
        await writeAuditLog({
          userId: user.id,
          action: "login",
          identifier,
          provider: "password",
          ip: req.ip!,
          deviceIdHash,
          result: "fail_wrong_password",
        });
        res.fail("ROUND1_INVALID_CREDENTIALS", "用户名或密码错误", 401);
        return;
      }

      // Success — regenerate session
      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.sessionVersion = user.sessionVersion;
      req.session.createdAt = Date.now();
      req.session.lastStrongAuthAt = Date.now();

      // Update last_strong_auth_at in DB
      await db
        .update(users)
        .set({ lastStrongAuthAt: new Date() })
        .where(eq(users.id, user.id));

      // Audit log
      await writeAuditLog({
        userId: user.id,
        action: "login",
        identifier,
        provider: "password",
        ip: req.ip!,
        deviceIdHash,
        result: "success",
      });

      res.ok({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// ─── Phase 3: Password Reset + Change ────────────────────────────────

// 8. POST /auth/password/request-challenge
authRouter.post(
  "/auth/password/request-challenge",
  challengePerEmailLimiter,
  challengePerIpLimiter,
  forgotPerEmailLimiter,
  validate(PasswordResetRequestBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, turnstileToken, powSolution } = req.body;

      // PoW check
      if (env.AUTH_POW_ENABLED) {
        if (!powSolution) {
          res.fail("ROUND1_POW_REQUIRED", "需要完成工作量证明", 400);
          return;
        }
        const powOk = await verifyPowSolution(powSolution);
        if (!powOk) {
          res.fail("ROUND1_POW_INVALID", "工作量证明无效或已过期", 400);
          return;
        }
      }

      // Turnstile check
      if (turnstileToken) {
        const ok = await verifyTurnstile(turnstileToken, req.ip!);
        if (!ok) {
          res.fail("ROUND1_TURNSTILE_FAILED", "人机验证失败，请重试", 400);
          return;
        }
      }

      // Always return success to prevent enumeration
      const [emailRow] = await db
        .select({ id: userEmails.id })
        .from(userEmails)
        .where(eq(userEmails.email, email))
        .limit(1);

      if (emailRow) {
        await createChallenge({ flow: "reset_password", email });
      }

      res.ok({ message: "如果该邮箱已注册，验证码已发送" });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 9. POST /auth/password/verify-code
authRouter.post(
  "/auth/password/verify-code",
  validate(VerifyCodeBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { challengeId, code } = req.body;
      const result = await verifyCode({ challengeId, code });
      res.ok({ ticket: result.ticket, flow: result.flow });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 10. POST /auth/password/redeem-link
authRouter.post(
  "/auth/password/redeem-link",
  validate(RedeemLinkBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { challengeId, token } = req.body;
      const result = await redeemLink({ challengeId, token });
      res.ok({ ticket: result.ticket, flow: result.flow });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 11. POST /auth/password/reset
authRouter.post(
  "/auth/password/reset",
  validate(PasswordResetBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ticket, newPassword } = req.body;

      const ticketData = await consumeTicket({
        ticket,
        flow: "reset_password",
      });
      const email = ticketData.email;

      // Find user by email
      const [emailRow] = await db
        .select({ userId: userEmails.userId })
        .from(userEmails)
        .where(eq(userEmails.email, email))
        .limit(1);

      if (!emailRow) {
        res.fail("ROUND1_USER_NOT_FOUND", "用户不存在", 404);
        return;
      }

      // zxcvbn check
      const strength = zxcvbn(newPassword);
      if (strength.score < 3) {
        res.fail("ROUND1_WEAK_PASSWORD", "密码强度不足，请使用更复杂的密码", 400);
        return;
      }

      // Hash and update
      const passwordHash = await argon2.hash(newPassword, {
        type: argon2.argon2id,
      });

      await db
        .update(users)
        .set({
          passwordHash,
          sessionVersion: sql`${users.sessionVersion} + 1`,
        })
        .where(eq(users.id, emailRow.userId));

      // Audit log
      await writeAuditLog({
        userId: emailRow.userId,
        action: "password_reset",
        identifier: email,
        ip: req.ip!,
        result: "success",
      });

      res.ok({ message: "密码已重置" });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 12. POST /auth/password/change
authRouter.post(
  "/auth/password/change",
  requireAuth,
  validate(PasswordChangeBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.session.userId!;

      // Verify current password
      const [user] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user?.passwordHash) {
        res.fail("ROUND1_INVALID_CREDENTIALS", "当前密码错误", 401);
        return;
      }

      const valid = await argon2.verify(user.passwordHash, currentPassword);
      if (!valid) {
        res.fail("ROUND1_INVALID_CREDENTIALS", "当前密码错误", 401);
        return;
      }

      // zxcvbn check
      const strength = zxcvbn(newPassword);
      if (strength.score < 3) {
        res.fail("ROUND1_WEAK_PASSWORD", "密码强度不足，请使用更复杂的密码", 400);
        return;
      }

      // Hash and update
      const passwordHash = await argon2.hash(newPassword, {
        type: argon2.argon2id,
      });

      const [updated] = await db
        .update(users)
        .set({
          passwordHash,
          sessionVersion: sql`${users.sessionVersion} + 1`,
        })
        .where(eq(users.id, userId))
        .returning({ sessionVersion: users.sessionVersion });

      if (!updated) throw new AppError("ROUND1_INTERNAL_ERROR", "更新失败", 500);

      // Update current session to match new version
      req.session.sessionVersion = updated.sessionVersion;
      req.session.lastStrongAuthAt = Date.now();

      // Audit log
      await writeAuditLog({
        userId,
        action: "password_change",
        ip: req.ip!,
        result: "success",
      });

      res.ok({ message: "密码已修改" });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// ─── Phase 4: OIDC placeholders ──────────────────────────────────────

// 13. GET /auth/oidc/cpplearn/start
authRouter.get(
  "/auth/oidc/cpplearn/start",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const intent = (req.query.intent as string) || "login";
      if (intent !== "login" && intent !== "register" && intent !== "bind") {
        res.fail("ROUND1_INVALID_PARAM", "无效的 intent 参数", 400);
        return;
      }

      let sessionData: { userId: string; sessionIdHash: string; sessionVersion: number } | undefined;
      if (intent === "bind") {
        if (!req.session.userId) {
          res.fail("ROUND1_AUTH_REQUIRED", "绑定操作需要先登录", 401);
          return;
        }
        sessionData = {
          userId: req.session.userId,
          sessionIdHash: sha256(req.sessionID),
          sessionVersion: req.session.sessionVersion ?? 0,
        };
      }

      const { url, state, nonce, codeVerifier } = await buildAuthorizationUrl(intent, sessionData);
      req.session.oidcState = { state, nonce, codeVerifier };
      req.session.save((err) => {
        if (err) return next(err);
        res.redirect(302, url);
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 14. GET /auth/oidc/cpplearn/callback
authRouter.get(
  "/auth/oidc/cpplearn/callback",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const oidcState = req.session.oidcState;
      if (!oidcState) {
        res.fail("ROUND1_OIDC_STATE_MISSING", "OIDC 状态丢失，请重新登录", 400);
        return;
      }
      const { state, nonce, codeVerifier } = oidcState;
      delete req.session.oidcState;

      // Reconstruct current URL from request
      const protocol = req.protocol;
      const host = req.get("host")!;
      const currentUrl = new URL(`${protocol}://${host}${req.originalUrl}`);

      const { sub, email, name } = await handleCallback(currentUrl, state, nonce, codeVerifier);

      // Parse intent from state
      const statePayload = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
      const intent = statePayload.intent as "login" | "register" | "bind";

      // Check existing binding
      const [existingBinding] = await db
        .select()
        .from(externalIdentities)
        .where(
          and(
            eq(externalIdentities.provider, "cpplearn"),
            eq(externalIdentities.providerUserId, sub),
          ),
        )
        .limit(1);

      if (intent === "bind") {
        // bind flow — user must be logged in
        if (!req.session.userId) {
          res.fail("ROUND1_AUTH_REQUIRED", "绑定操作需要先登录", 401);
          return;
        }
        if (existingBinding) {
          if (existingBinding.userId === req.session.userId) {
            // Idempotent — already bound to self
            res.redirect(302, safeReturnTo("/settings/security"));
            return;
          }
          // Bound to another user
          res.redirect(302, safeReturnTo("/settings/security?error=already_bound"));
          return;
        }
        // Create binding to current user
        await db.insert(externalIdentities).values({
          userId: req.session.userId,
          provider: "cpplearn",
          providerType: "oidc",
          providerUserId: sub,
          providerEmail: email ?? null,
        });
        await writeAuditLog({
          userId: req.session.userId,
          action: "oidc_bind",
          provider: "cpplearn",
          ip: req.ip!,
          result: "success",
        });
        res.redirect(302, safeReturnTo("/settings/security"));
        return;
      }

      // login / register flow
      if (existingBinding) {
        // Already bound — create session regardless of intent
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, existingBinding.userId));
        if (!user || user.status !== "active") {
          res.fail("ROUND1_ACCOUNT_LOCKED", "账号已被禁用", 403);
          return;
        }
        await regenerateSession(req);
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.sessionVersion = user.sessionVersion;
        req.session.createdAt = Date.now();
        req.session.lastStrongAuthAt = Date.now();
        await writeAuditLog({
          userId: user.id,
          action: "oidc_login",
          provider: "cpplearn",
          ip: req.ip!,
          result: "success",
        });
        req.session.save((err) => {
          if (err) return next(err);
          res.redirect(302, safeReturnTo("/"));
        });
        return;
      }

      // Not bound — issue completeProfileTicket
      const ticket = crypto.randomBytes(32).toString("base64url");
      req.session.completeProfileTicketHash = sha256(ticket);
      req.session.completeProfileData = {
        provider: "cpplearn",
        providerUserId: sub,
        providerEmail: email,
        displayNameHint: name,
      };
      req.session.save((err) => {
        if (err) return next(err);
        res.redirect(302, safeReturnTo(`/auth/complete-profile?ticket=${encodeURIComponent(ticket)}`));
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 15. POST /auth/complete-profile
authRouter.post(
  "/auth/complete-profile",
  validate(CompleteProfileBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ticket, username, password, displayName, deviceIdHash } = req.body;

      // Verify ticket
      if (!req.session.completeProfileTicketHash || sha256(ticket) !== req.session.completeProfileTicketHash) {
        res.fail("ROUND1_INVALID_TICKET", "无效或过期的 ticket", 400);
        return;
      }
      const profileData = req.session.completeProfileData;
      if (!profileData) {
        res.fail("ROUND1_MISSING_PROFILE_DATA", "缺少 OIDC 注册数据", 400);
        return;
      }

      // zxcvbn password strength check
      const strength = zxcvbn(password, [username]);
      if (strength.score < 3) {
        res.fail("ROUND1_WEAK_PASSWORD", "密码强度不足，请选择更复杂的密码", 400);
        return;
      }

      // Check username not taken
      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      if (existingUser) {
        res.fail("ROUND1_USERNAME_TAKEN", "用户名已被占用", 409);
        return;
      }

      // Hash password
      const passwordHash = await argon2.hash(password);

      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          displayName: displayName || profileData.displayNameHint || username,
          passwordHash,
          role: "student",
        })
        .returning({ id: users.id, role: users.role, sessionVersion: users.sessionVersion });

      if (!newUser) {
        res.fail("ROUND1_INTERNAL", "创建用户失败", 500);
        return;
      }

      // Create userEmails entry if providerEmail exists
      if (profileData.providerEmail) {
        await db.insert(userEmails).values({
          userId: newUser.id,
          email: profileData.providerEmail,
          source: "oidc",
        });
      }

      // Create external identity binding
      await db.insert(externalIdentities).values({
        userId: newUser.id,
        provider: profileData.provider,
        providerType: "oidc",
        providerUserId: profileData.providerUserId,
        providerEmail: profileData.providerEmail ?? null,
      });

      // Clear profile data from session
      delete req.session.completeProfileTicketHash;
      delete req.session.completeProfileData;

      // Create session
      await regenerateSession(req);
      req.session.userId = newUser.id;
      req.session.role = newUser.role;
      req.session.sessionVersion = newUser.sessionVersion;
      req.session.createdAt = Date.now();
      req.session.lastStrongAuthAt = Date.now();

      await writeAuditLog({
        userId: newUser.id,
        action: "oidc_register",
        provider: profileData.provider,
        ip: req.ip!,
        deviceIdHash,
        result: "success",
      });

      res.ok({ userId: newUser.id, username });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// ─── Phase 4.5: QQ互联 OAuth 2.0 — interface reserved ───────────────

// GET /auth/external/:provider/start
authRouter.get("/auth/external/:provider/start", (req: Request, res: Response) => {
  const provider = req.params.provider as string;
  if (provider === "qq" && !env.AUTH_PROVIDER_QQ_ENABLED) {
    res.fail("ROUND1_PROVIDER_DISABLED", "该登录方式尚未开放", 403);
    return;
  }
  res.fail("ROUND1_NOT_IMPLEMENTED", `${provider} OAuth 暂未实现`, 501);
});

// GET /auth/external/:provider/callback
authRouter.get("/auth/external/:provider/callback", (req: Request, res: Response) => {
  const provider = req.params.provider as string;
  res.fail("ROUND1_NOT_IMPLEMENTED", `${provider} OAuth 回调暂未实现`, 501);
});

// ─── Phase 5: Passkey ────────────────────────────────────────────────

const rpID = new URL(env.APP_PUBLIC_URL).hostname;
const rpOrigin = env.APP_PUBLIC_URL;

// 16. POST /auth/login/passkey/options
authRouter.post(
  "/auth/login/passkey/options",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: "preferred",
      });
      req.session.passkeyChallenge = options.challenge;
      res.ok(options);
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 17. POST /auth/login/passkey/verify
authRouter.post(
  "/auth/login/passkey/verify",
  validate(PasskeyLoginVerifyBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const expectedChallenge = req.session.passkeyChallenge;
      if (!expectedChallenge) {
        res.fail("ROUND1_PASSKEY_CHALLENGE_MISSING", "请先获取 Passkey 选项", 400);
        return;
      }
      delete req.session.passkeyChallenge;

      const credential = req.body as AuthenticationResponseJSON;
      if (!credential?.id) {
        res.fail("ROUND1_VALIDATION", "缺少 credential", 400);
        return;
      }

      // Look up passkey
      const [row] = await db
        .select()
        .from(passkeyCredentials)
        .where(eq(passkeyCredentials.credentialId, credential.id))
        .limit(1);

      if (!row) {
        res.fail("ROUND1_PASSKEY_NOT_FOUND", "未找到对应的 Passkey", 404);
        return;
      }

      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge,
        expectedOrigin: rpOrigin,
        expectedRPID: rpID,
        credential: {
          id: row.credentialId,
          publicKey: Buffer.from(row.publicKey, "base64url"),
          counter: row.counter,
          transports: (row.transportsJson as AuthenticatorTransportFuture[] | null) ?? undefined,
        },
      });

      if (!verification.verified) {
        res.fail("ROUND1_PASSKEY_VERIFY_FAILED", "Passkey 验证失败", 401);
        return;
      }

      // Update counter
      await db
        .update(passkeyCredentials)
        .set({ counter: verification.authenticationInfo.newCounter })
        .where(eq(passkeyCredentials.id, row.id));

      // Get user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, row.userId))
        .limit(1);

      if (!user || user.status !== "active") {
        res.fail("ROUND1_USER_DISABLED", "账号已被禁用", 403);
        return;
      }

      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.sessionVersion = user.sessionVersion;
      req.session.createdAt = Date.now();
      req.session.lastStrongAuthAt = Date.now();

      await writeAuditLog({
        userId: user.id,
        action: "passkey_login",
        provider: "passkey",
        ip: req.ip ?? "unknown",
        result: "success",
      });

      res.ok({ verified: true });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 18. POST /auth/passkeys/register/options
authRouter.post(
  "/auth/passkeys/register/options",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [user] = await db
        .select({ username: users.username, displayName: users.displayName })
        .from(users)
        .where(eq(users.id, req.session.userId!))
        .limit(1);

      if (!user) {
        res.fail("ROUND1_USER_NOT_FOUND", "用户不存在", 404);
        return;
      }

      const existing = await db
        .select({
          credentialId: passkeyCredentials.credentialId,
          transportsJson: passkeyCredentials.transportsJson,
        })
        .from(passkeyCredentials)
        .where(eq(passkeyCredentials.userId, req.session.userId!));

      const options = await generateRegistrationOptions({
        rpName: "Round1",
        rpID,
        userName: user.username,
        userDisplayName: user.displayName,
        attestationType: "none",
        excludeCredentials: existing.map((c) => ({
          id: c.credentialId,
          transports: (c.transportsJson as AuthenticatorTransportFuture[] | null) ?? undefined,
        })),
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
      });

      req.session.passkeyChallenge = options.challenge;
      res.ok(options);
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// POST /auth/passkeys/register/verify
authRouter.post(
  "/auth/passkeys/register/verify",
  requireAuth,
  validate(PasskeyRegisterVerifyBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const expectedChallenge = req.session.passkeyChallenge;
      if (!expectedChallenge) {
        res.fail("ROUND1_PASSKEY_CHALLENGE_MISSING", "请先获取注册选项", 400);
        return;
      }
      delete req.session.passkeyChallenge;

      const credential = req.body as RegistrationResponseJSON;

      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge,
        expectedOrigin: rpOrigin,
        expectedRPID: rpID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        res.fail("ROUND1_PASSKEY_VERIFY_FAILED", "Passkey 注册验证失败", 400);
        return;
      }

      const { id, publicKey, counter, transports } =
        verification.registrationInfo.credential;
      const { credentialBackedUp: backupState, credentialDeviceType } =
        verification.registrationInfo;
      const backupEligible = credentialDeviceType === "multiDevice";

      await db.insert(passkeyCredentials).values({
        userId: req.session.userId!,
        credentialId: id,
        publicKey: Buffer.from(publicKey).toString("base64url"),
        counter,
        transportsJson: transports ?? null,
        backupEligible,
        backupState,
      });

      res.ok({ verified: true });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// DELETE /auth/passkeys/:credentialId
authRouter.delete(
  "/auth/passkeys/:credentialId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const credentialId = req.params.credentialId as string;

      const result = await db
        .delete(passkeyCredentials)
        .where(
          and(
            eq(passkeyCredentials.credentialId, credentialId),
            eq(passkeyCredentials.userId, req.session.userId!),
          ),
        );

      if (result.rowCount === 0) {
        res.fail("ROUND1_PASSKEY_NOT_FOUND", "未找到对应的 Passkey", 404);
        return;
      }

      res.ok({ deleted: true });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// ─── Phase 6: Admin + Step-up + TOTP + Logout ────────────────────────

// 19. POST /auth/logout
authRouter.post(
  "/auth/logout",
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    req.session.destroy((err) => {
      if (err) {
        next(err);
        return;
      }
      res.clearCookie("__Host-Round1.sid", { path: "/" });
      res.ok({ message: "已退出登录" });
    });
  },
);

// 20. POST /auth/email/change/request-challenge
authRouter.post(
  "/auth/email/change/request-challenge",
  requireAuth,
  validate(EmailChangeRequestBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { newEmail, turnstileToken } = req.body;

      // Turnstile check
      if (turnstileToken) {
        const ok = await verifyTurnstile(turnstileToken, req.ip!);
        if (!ok) {
          res.fail("ROUND1_TURNSTILE_FAILED", "人机验证失败，请重试", 400);
          return;
        }
      }

      // Temp email blocklist
      if (await isTempEmail(newEmail)) {
        res.fail("ROUND1_TEMP_EMAIL", "不支持临时邮箱", 400);
        return;
      }

      // Check new email not taken
      const [existing] = await db
        .select({ id: userEmails.id })
        .from(userEmails)
        .where(eq(userEmails.email, newEmail))
        .limit(1);

      if (existing) {
        res.fail("ROUND1_EMAIL_TAKEN", "该邮箱已被使用", 409);
        return;
      }

      const result = await createChallenge({
        flow: "change_email",
        email: newEmail,
      });
      res.ok({ challengeId: result.challengeId, expiresAt: result.expiresAt });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 21. POST /auth/email/change/verify-code
authRouter.post(
  "/auth/email/change/verify-code",
  requireAuth,
  validate(VerifyCodeBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { challengeId, code } = req.body;
      const result = await verifyCode({ challengeId, code });
      res.ok({ ticket: result.ticket });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 22. POST /auth/email/change/redeem-link
authRouter.post(
  "/auth/email/change/redeem-link",
  requireAuth,
  validate(RedeemLinkBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { challengeId, token } = req.body;
      const result = await redeemLink({ challengeId, token });
      res.ok({ ticket: result.ticket });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 23. POST /auth/email/change/confirm
authRouter.post(
  "/auth/email/change/confirm",
  requireAuth,
  validate(EmailChangeConfirmBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ticket } = req.body;
      const userId = req.session.userId!;

      const ticketData = await consumeTicket({
        ticket,
        flow: "change_email",
      });
      const newEmail = ticketData.email;

      // Update user email
      await db
        .update(userEmails)
        .set({ email: newEmail })
        .where(eq(userEmails.userId, userId));

      // Audit log
      await writeAuditLog({
        userId,
        action: "email_change",
        identifier: newEmail,
        ip: req.ip!,
        result: "success",
      });

      res.ok({ message: "邮箱已更换" });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 24. DELETE /auth/external/:provider
authRouter.delete(
  "/auth/external/:provider",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId!;
      const provider = req.params.provider as string;

      await db
        .delete(externalIdentities)
        .where(
          and(
            eq(externalIdentities.userId, userId),
            eq(externalIdentities.provider, provider),
          ),
        );

      // Audit log
      await writeAuditLog({
        userId,
        action: "unlink_external",
        provider,
        ip: req.ip!,
        result: "success",
      });

      res.ok({ message: "已解除绑定" });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// 25. Step-up routes — placeholders

// POST /auth/reauth/password
authRouter.post(
  "/auth/reauth/password",
  requireAuth,
  validate(PasswordReauthBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { password } = req.body;
      if (!password) {
        res.fail("ROUND1_VALIDATION", "缺少密码字段", 400);
        return;
      }

      const [user] = await db
        .select({ id: users.id, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, req.session.userId!));

      if (!user || !user.passwordHash) {
        res.fail("ROUND1_PASSWORD_MISMATCH", "密码错误", 401);
        return;
      }

      const valid = await argon2.verify(user.passwordHash, password);
      if (!valid) {
        await writeAuditLog({
          userId: user.id,
          action: "reauth_password",
          ip: req.ip!,
          result: "fail",
        });
        res.fail("ROUND1_PASSWORD_MISMATCH", "密码错误", 401);
        return;
      }

      req.session.lastStrongAuthAt = Date.now();

      await writeAuditLog({
        userId: user.id,
        action: "reauth_password",
        ip: req.ip!,
        result: "success",
      });

      res.ok({ verified: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /auth/reauth/passkey/options
authRouter.post(
  "/auth/reauth/passkey/options",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userCreds = await db
        .select({
          credentialId: passkeyCredentials.credentialId,
          transportsJson: passkeyCredentials.transportsJson,
        })
        .from(passkeyCredentials)
        .where(eq(passkeyCredentials.userId, req.session.userId!));

      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: "preferred",
        allowCredentials: userCreds.map((c) => ({
          id: c.credentialId,
          transports: (c.transportsJson as AuthenticatorTransportFuture[] | null) ?? undefined,
        })),
      });

      req.session.passkeyChallenge = options.challenge;
      res.ok(options);
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// POST /auth/reauth/passkey/verify
authRouter.post(
  "/auth/reauth/passkey/verify",
  requireAuth,
  validate(PasskeyLoginVerifyBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const expectedChallenge = req.session.passkeyChallenge;
      if (!expectedChallenge) {
        res.fail("ROUND1_PASSKEY_CHALLENGE_MISSING", "请先获取 Passkey 选项", 400);
        return;
      }
      delete req.session.passkeyChallenge;

      const credential = req.body as AuthenticationResponseJSON;
      if (!credential?.id) {
        res.fail("ROUND1_VALIDATION", "缺少 credential", 400);
        return;
      }

      // Only allow credentials belonging to current user
      const [row] = await db
        .select()
        .from(passkeyCredentials)
        .where(
          and(
            eq(passkeyCredentials.credentialId, credential.id),
            eq(passkeyCredentials.userId, req.session.userId!),
          ),
        )
        .limit(1);

      if (!row) {
        res.fail("ROUND1_PASSKEY_NOT_FOUND", "未找到对应的 Passkey", 404);
        return;
      }

      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge,
        expectedOrigin: rpOrigin,
        expectedRPID: rpID,
        credential: {
          id: row.credentialId,
          publicKey: Buffer.from(row.publicKey, "base64url"),
          counter: row.counter,
          transports: (row.transportsJson as AuthenticatorTransportFuture[] | null) ?? undefined,
        },
      });

      if (!verification.verified) {
        res.fail("ROUND1_PASSKEY_VERIFY_FAILED", "Passkey 验证失败", 401);
        return;
      }

      // Update counter
      await db
        .update(passkeyCredentials)
        .set({ counter: verification.authenticationInfo.newCounter })
        .where(eq(passkeyCredentials.id, row.id));

      req.session.lastStrongAuthAt = Date.now();
      res.ok({ verified: true });
    } catch (err) {
      if (err instanceof AppError) {
        res.fail(err.code, err.message, err.status);
        return;
      }
      next(err);
    }
  },
);

// POST /auth/reauth/totp — step-up auth via TOTP
authRouter.post(
  "/auth/reauth/totp",
  requireAuth,
  validate(TotpReauthBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.body as { code?: string };
      if (!code || typeof code !== "string") {
        res.fail("ROUND1_VALIDATION", "请输入验证码", 400);
        return;
      }

      const [user] = await db
        .select({ totpSecretEnc: users.totpSecretEnc })
        .from(users)
        .where(eq(users.id, req.session.userId!))
        .limit(1);

      if (!user?.totpSecretEnc) {
        res.fail("ROUND1_TOTP_NOT_ENABLED", "尚未启用 TOTP", 400);
        return;
      }

      const secret = decryptTotpSecret(user.totpSecretEnc);
      if (!verifyTotp(secret, code)) {
        res.fail("ROUND1_TOTP_INVALID", "验证码无效", 401);
        return;
      }

      req.session.lastStrongAuthAt = Date.now();
      res.ok({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// 26. TOTP routes

// POST /auth/totp/enroll/start — begin TOTP enrollment
authRouter.post(
  "/auth/totp/enroll/start",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if TOTP is already enabled
      const [user] = await db
        .select({
          totpEnabledAt: users.totpEnabledAt,
          username: users.username,
        })
        .from(users)
        .where(eq(users.id, req.session.userId!))
        .limit(1);

      if (!user) {
        res.fail("ROUND1_NOT_FOUND", "用户不存在", 404);
        return;
      }

      if (user.totpEnabledAt) {
        res.fail("ROUND1_TOTP_ALREADY_ENABLED", "TOTP 已启用", 409);
        return;
      }

      // Generate secret and encrypt it
      const { secret, otpauthUrl } = generateTotpSecret(user.username);
      const encrypted = encryptTotpSecret(secret);

      // Store in session temporarily (not DB yet)
      req.session.totpPendingSecret = encrypted;

      res.ok({ otpauthUrl });
    } catch (err) {
      next(err);
    }
  },
);

// POST /auth/totp/enroll/verify — confirm TOTP enrollment with a code
authRouter.post(
  "/auth/totp/enroll/verify",
  requireAuth,
  validate(TotpEnrollVerifyBody),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.body as { code?: string };
      if (!code || typeof code !== "string") {
        res.fail("ROUND1_VALIDATION", "请输入验证码", 400);
        return;
      }

      const pending = req.session.totpPendingSecret;
      if (!pending) {
        res.fail("ROUND1_TOTP_NO_PENDING", "请先发起 TOTP 注册", 400);
        return;
      }

      // Decrypt pending secret and verify the code
      const secret = decryptTotpSecret(pending);
      if (!verifyTotp(secret, code)) {
        res.fail("ROUND1_TOTP_INVALID", "验证码无效", 401);
        return;
      }

      // Save encrypted secret to DB
      await db
        .update(users)
        .set({
          totpSecretEnc: pending,
          totpEnabledAt: new Date(),
        })
        .where(eq(users.id, req.session.userId!));

      // Clear pending secret from session
      delete req.session.totpPendingSecret;

      // Mark as strong auth
      req.session.lastStrongAuthAt = Date.now();

      res.ok({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /auth/totp — remove TOTP (requires recent auth)
authRouter.delete(
  "/auth/totp",
  requireAuth,
  requireRecentAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await db
        .update(users)
        .set({
          totpSecretEnc: null,
          totpEnabledAt: null,
        })
        .where(eq(users.id, req.session.userId!));

      res.ok({ success: true });
    } catch (err) {
      next(err);
    }
  },
);
