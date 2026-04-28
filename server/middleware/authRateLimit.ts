import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient } from "../redis.js";
import { env } from "../../config/env.js";
import type { Request } from "express";

const makeStore = (prefix: string) =>
  new RedisStore({
    sendCommand: (...args: string[]) => {
      if (!redisClient.isOpen) {
        return redisClient.connect().then(() => redisClient.sendCommand(args));
      }
      return redisClient.sendCommand(args);
    },
    prefix: `rl:${prefix}:`,
  });

const failMessage = {
  success: false,
  error: {
    code: "ROUND1_RATE_LIMITED",
    message: "操作过于频繁，请稍后再试",
  },
};

const requestIpKey = (req: Request) => req.ip ?? "unknown";

// 1. Email challenge sending: per-email per-hour
export const challengePerEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.AUTH_EMAIL_CODE_MAX_PER_EMAIL_PER_HOUR,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: makeStore("challenge-email"),
  keyGenerator: (req: Request) => `email:${(req.body?.email ?? "").toLowerCase()}`,
  message: failMessage,
});

// 2. Email challenge per IP: per-IP per-10min
export const challengePerIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: env.AUTH_EMAIL_CODE_MAX_PER_IP_PER_10M,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: makeStore("challenge-ip"),
  keyGenerator: (req: Request) => `ip:${requestIpKey(req)}`,
  message: failMessage,
});

// 3. Login fail per account: per-15min
export const loginPerAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.AUTH_LOGIN_FAIL_PER_ACCOUNT_PER_15M,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: makeStore("login-account"),
  keyGenerator: (req: Request) => `acct:${(req.body?.identifier ?? "").toLowerCase()}`,
  message: failMessage,
  skipSuccessfulRequests: true,
});

// 4. Login fail per device: per-10min
export const loginPerDeviceLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: env.AUTH_LOGIN_FAIL_PER_DEVICE_PER_10M,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: makeStore("login-device"),
  keyGenerator: (req: Request) => `dev:${req.body?.deviceIdHash ?? requestIpKey(req)}`,
  message: failMessage,
  skipSuccessfulRequests: true,
});

// 5. Forgot password per email: per-hour
export const forgotPerEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.AUTH_FORGOT_PASSWORD_MAX_PER_EMAIL_PER_HOUR,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: makeStore("forgot-email"),
  keyGenerator: (req: Request) => `email:${(req.body?.email ?? "").toLowerCase()}`,
  message: failMessage,
});

// 6. Register per IP: per-10min
export const registerPerIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: env.AUTH_REGISTER_PER_IP_PER_10M,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: makeStore("register-ip"),
  keyGenerator: (req: Request) => `ip:${requestIpKey(req)}`,
  message: failMessage,
});
