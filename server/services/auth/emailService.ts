import crypto from "node:crypto";
import { eq, and, gt, sql } from "drizzle-orm";
import { db } from "../../db.js";
import { env } from "../../../config/env.js";
import { logger } from "../../logger.js";
import { authChallenges } from "../../db/schema/authChallenges.js";
import { authTickets } from "../../db/schema/authTickets.js";
import { sendMail } from "../mail/index.js";
import { AppError } from "../../lib/errors.js";
import { renderChallengeEmailHtml, type ChallengeFlow } from "./emailTemplates.js";

// ── Helpers ──────────────────────────────────────────────────────────

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function htmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FLOW_SUBJECT: Record<string, string> = {
  register: "Round1 — 注册验证码",
  reset_password: "Round1 — 重置密码验证码",
  change_email: "Round1 — 更换邮箱验证码",
};

// ── Public API ───────────────────────────────────────────────────────

export async function createChallenge(opts: {
  flow: ChallengeFlow;
  email: string;
}): Promise<{ challengeId: string; expiresAt: Date }> {
  const { flow, email } = opts;

  const challengeId = crypto.randomUUID();
  const code = crypto.randomInt(100000, 999999).toString();
  const linkToken = crypto.randomBytes(32).toString("hex");

  const codeHash = sha256(code + challengeId);
  const linkTokenHash = sha256(linkToken);
  const expiresAt = new Date(Date.now() + env.AUTH_EMAIL_CODE_EXPIRES_SECONDS * 1000);

  await db.insert(authChallenges).values({
    id: challengeId,
    flow,
    email,
    codeHash,
    linkTokenHash,
    expiresAt,
  });

  const expiresMinutes = String(Math.floor(env.AUTH_EMAIL_CODE_EXPIRES_SECONDS / 60));
  const link = `${env.APP_PUBLIC_URL}/auth/callback?flow=${encodeURIComponent(flow)}&token=${encodeURIComponent(linkToken)}&challenge=${encodeURIComponent(challengeId)}`;

  const html = renderChallengeEmailHtml(flow, {
    CODE: htmlEscape(code),
    LINK: htmlEscape(link),
    EXPIRES_MINUTES: htmlEscape(expiresMinutes),
  });

  const subject = FLOW_SUBJECT[flow] ?? "Round1 — 验证码";

  await sendMail({
    to: email,
    subject,
    html,
    text: `您的验证码是 ${code}，有效期 ${expiresMinutes} 分钟。\n链接：${link}`,
  });

  logger.info({ flow, email, challengeId }, "Challenge created");

  return { challengeId, expiresAt };
}

export async function verifyCode(opts: {
  challengeId: string;
  code: string;
}): Promise<{ ticket: string; flow: string; email: string }> {
  const { challengeId, code } = opts;

  const [challenge] = await db
    .select()
    .from(authChallenges)
    .where(and(eq(authChallenges.id, challengeId), gt(authChallenges.expiresAt, new Date())))
    .limit(1);

  if (!challenge) {
    throw new AppError("CHALLENGE_NOT_FOUND", "验证码不存在或已过期", 400);
  }

  if (challenge.attemptCount >= 5) {
    throw new AppError("TOO_MANY_ATTEMPTS", "验证码尝试次数过多，请重新获取", 429);
  }

  // Increment attempt count
  await db
    .update(authChallenges)
    .set({ attemptCount: sql`${authChallenges.attemptCount} + 1` })
    .where(eq(authChallenges.id, challengeId));

  const expectedHash = sha256(code + challengeId);

  if (expectedHash !== challenge.codeHash) {
    throw new AppError("INVALID_CODE", "验证码错误", 400);
  }

  const ticket = await issueTicket({
    id: challenge.id,
    flow: challenge.flow,
    email: challenge.email,
  });

  return { ticket, flow: challenge.flow, email: challenge.email };
}

export async function redeemLink(opts: {
  challengeId: string;
  token: string;
}): Promise<{ ticket: string; flow: string; email: string }> {
  const { challengeId, token } = opts;

  const [challenge] = await db
    .select()
    .from(authChallenges)
    .where(and(eq(authChallenges.id, challengeId), gt(authChallenges.expiresAt, new Date())))
    .limit(1);

  if (!challenge) {
    throw new AppError("CHALLENGE_NOT_FOUND", "链接无效或已过期", 400);
  }

  const expectedHash = sha256(token);

  if (expectedHash !== challenge.linkTokenHash) {
    throw new AppError("INVALID_LINK_TOKEN", "链接无效", 400);
  }

  const ticket = await issueTicket({
    id: challenge.id,
    flow: challenge.flow,
    email: challenge.email,
  });

  return { ticket, flow: challenge.flow, email: challenge.email };
}

async function issueTicket(challenge: {
  id: string;
  flow: string;
  email: string;
}): Promise<string> {
  const ticket = crypto.randomBytes(32).toString("hex");
  const ticketHash = sha256(ticket);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(authTickets).values({
    challengeId: challenge.id,
    flow: challenge.flow,
    ticketHash,
    payloadJson: { email: challenge.email },
    expiresAt,
  });

  return ticket;
}

export async function consumeTicket(opts: {
  ticket: string;
  flow: string;
}): Promise<{ email: string; challengeId: string }> {
  const { ticket, flow } = opts;
  const ticketHash = sha256(ticket);

  const [row] = await db
    .select()
    .from(authTickets)
    .where(
      and(
        eq(authTickets.ticketHash, ticketHash),
        eq(authTickets.flow, flow),
        gt(authTickets.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row || row.consumedAt) {
    throw new AppError("INVALID_TICKET", "凭据无效或已使用", 400);
  }

  await db
    .update(authTickets)
    .set({ consumedAt: sql`now()` })
    .where(eq(authTickets.id, row.id));

  const payload = row.payloadJson as { email: string };

  return { email: payload.email, challengeId: row.challengeId };
}
