import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const llmReasoningPolicyTokens = [
  "default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

const llmReasoningPolicyTokenSet = new Set<string>(llmReasoningPolicyTokens);
const llmReasoningSummaryModes = ["off", "auto", "detailed"] as const;
const llmReasoningSummaryModeSet = new Set<string>(llmReasoningSummaryModes);
const llmThinkingTypeModes = ["default", "enabled", "disabled"] as const;
const llmThinkingTypeModeSet = new Set<string>(llmThinkingTypeModes);
const llmProviderSlugs = [
  "openai",
  "anthropic",
  "google",
  "xiaomi",
  "alibaba",
  "moonshotai",
  "openrouter",
  "deepseek",
  "minimax",
  "volcengine",
  "xai",
  "zai",
] as const;
const llmProviderSlugSet = new Set<string>(llmProviderSlugs);

const llmReasoningEffortSchema = z
  .string()
  .default("")
  .transform((value) => value.trim())
  .superRefine((value, ctx) => {
    if (value.length === 0) {
      return;
    }

    const tokens = value
      .split(/[>,]/)
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length > 0);

    if (tokens.length === 0) {
      return;
    }

    const invalid = tokens.filter((token) => !llmReasoningPolicyTokenSet.has(token));
    if (invalid.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported LLM reasoning token(s): ${invalid.join(", ")}. Supported tokens: ${llmReasoningPolicyTokens.join(", ")}`,
      });
    }
  });

const llmReasoningSummarySchema = z
  .string()
  .default("")
  .transform((value) => value.trim().toLowerCase())
  .superRefine((value, ctx) => {
    if (value.length === 0 || value === "off") {
      return;
    }

    if (!llmReasoningSummaryModeSet.has(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported LLM reasoning summary mode: ${value}. Supported modes: ${llmReasoningSummaryModes.join(", ")}`,
      });
    }
  });

const llmThinkingTypeSchema = z
  .string()
  .default("")
  .transform((value) => value.trim().toLowerCase())
  .superRefine((value, ctx) => {
    if (value.length === 0 || value === "default") {
      return;
    }

    if (!llmThinkingTypeModeSet.has(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported LLM thinking type mode: ${value}. Supported modes: ${llmThinkingTypeModes.join(", ")}`,
      });
    }
  });

const llmThinkingBudgetSchema = z
  .string()
  .default("")
  .transform((value) => value.trim().toLowerCase())
  .superRefine((value, ctx) => {
    if (value.length === 0 || value === "default" || value === "dynamic" || value === "off") {
      return;
    }

    if (value === "-1") {
      return;
    }

    if (/^\d+$/.test(value)) {
      return;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Unsupported LLM thinking budget value. Use default, dynamic, off, -1, or a non-negative integer.",
    });
  });

const llmProviderSchema = z
  .string()
  .default("")
  .transform((value) => value.trim().toLowerCase())
  .superRefine((value, ctx) => {
    if (value.length === 0) {
      return;
    }

    if (!llmProviderSlugSet.has(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported LLM provider slug: ${value}. Supported providers: ${llmProviderSlugs.join(", ")}`,
      });
    }
  });

const llmProviderBaseUrlSchema = z
  .string()
  .default("")
  .transform((value) => value.trim());

const llmProviderModelSchema = z
  .string()
  .default("")
  .transform((value) => value.trim());

const booleanFlagSchema = z
  .string()
  .default("0")
  .transform((value) => {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  });

const llmOpenRouterModelSchema = z
  .string()
  .default("")
  .transform((value) => value.trim())
  .superRefine((value, ctx) => {
    if (value.length === 0) {
      return;
    }

    const separatorIndex = value.indexOf("/");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OPENROUTER_MODEL must use vendor/model format.",
      });
    }
  });

// Resolve .env from project root (works regardless of CWD — e.g. server/ workspace)
function findNearestEnvFile(startDir: string): string {
  let current = startDir;

  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = path.join(current, ".env");
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return path.join(startDir, ".env");
}

// Worktrees under .worktrees/ can reuse the parent checkout's ignored .env
// unless a worktree-local file exists.
dotenv.config({ path: findNearestEnvFile(path.resolve(import.meta.dirname, "..")) });

const envSchema = z.object({
  // Service
  PORT: z.coerce.number().default(5100),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  ROUND1_PM2_API_INSTANCES: z.coerce.number().default(2),
  ROUND1_PM2_ENABLE_RUNTIME_WORKER: booleanFlagSchema,
  ROUND1_PM2_ENABLE_CONTENT_WORKER: booleanFlagSchema,
  ROUND1_HEALTHCHECK_API_URL: z.string().default(""),
  ROUND1_HEALTHCHECK_FRONTEND_URL: z.string().default(""),
  ROUND1_HEALTHCHECK_TIMEOUT_MS: z.coerce.number().default(5000),
  ROUND1_HEALTHCHECK_INCLUDE_OFFLINE: booleanFlagSchema,
  ROUND1_HEALTHCHECK_INCLUDE_EXTERNAL: booleanFlagSchema,
  ROUND1_HEALTHCHECK_PM2: booleanFlagSchema,
  ROUND1_INITIAL_ADMIN_PASSWORD: z.string().default(""),

  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX_API: z.coerce.number().default(10),
  DATABASE_POOL_MAX_WORKER: z.coerce.number().default(5),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().default(30000),

  // Auth
  SESSION_SECRET: z.string().min(16),
  TOTP_ENCRYPTION_KEK: z.string().min(16),
  SESSION_COOKIE_SECURE: z.coerce.boolean().default(true),
  SESSION_COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  SESSION_IDLE_MINUTES: z.coerce.number().default(480),
  SESSION_ABSOLUTE_MINUTES: z.coerce.number().default(10080),
  EXAM_DRAFT_TTL_MINUTES: z.coerce.number().default(1440),
  SESSION_STORE: z.enum(["redis", "memory"]).default("redis"),
  AUTH_TURNSTILE_SITE_KEY: z.string().default(""),
  AUTH_TURNSTILE_SECRET_KEY: z.string().default(""),
  AUTH_POW_ENABLED: z
    .string()
    .default("1")
    .transform((v) => v === "1" || v.toLowerCase() === "true"),
  AUTH_POW_BASE_DIFFICULTY: z.coerce.number().default(18),
  AUTH_TEMP_EMAIL_BLOCKLIST_PATH: z.string().default("./config/temp-email-blocklist.txt"),
  AUTH_EMAIL_CODE_EXPIRES_SECONDS: z.coerce.number().default(600),
  AUTH_EMAIL_CODE_RESEND_SECONDS: z.coerce.number().default(60),
  AUTH_EMAIL_CODE_MAX_PER_EMAIL_PER_HOUR: z.coerce.number().default(5),
  AUTH_EMAIL_CODE_MAX_PER_IP_PER_10M: z.coerce.number().default(20),
  AUTH_FORGOT_PASSWORD_MAX_PER_EMAIL_PER_HOUR: z.coerce.number().default(3),
  AUTH_LOGIN_FAIL_PER_ACCOUNT_PER_15M: z.coerce.number().default(10),
  AUTH_LOGIN_FAIL_PER_DEVICE_PER_10M: z.coerce.number().default(20),
  AUTH_REGISTER_PER_IP_PER_10M: z.coerce.number().default(20),
  AUTH_STEP_UP_WINDOW_MINUTES: z.coerce.number().default(10),
  APP_PUBLIC_URL: z.string().url().default("https://round1.local"),
  APP_API_ORIGIN: z.string().url().default("https://round1.local"),
  TRUST_PROXY_HOPS: z.coerce.number().default(1),
  DEV_HTTPS_CERT: z.string().default("./certs/dev-cert.pem"),
  DEV_HTTPS_KEY: z.string().default("./certs/dev-key.pem"),

  // Mail
  MAIL_PROVIDER: z.enum(["resend", "postmark", "tencent-ses"]).default("resend"),
  MAIL_FROM: z.string().default(""),
  RESEND_API_KEY: z.string().default(""),
  POSTMARK_SERVER_TOKEN: z.string().default(""),
  TENCENT_SES_SECRET_ID: z.string().default(""),
  TENCENT_SES_SECRET_KEY: z.string().default(""),
  TENCENT_SES_REGION: z.string().default("ap-hongkong"),

  // Third-party identity
  AUTH_PROVIDER_QQ_ENABLED: z.coerce.boolean().default(false),
  QQ_CONNECT_CLIENT_ID: z.string().default(""),
  QQ_CONNECT_CLIENT_SECRET: z.string().default(""),
  QQ_CONNECT_REDIRECT_URI: z.string().default(""),
  CPPLEARN_OIDC_ISSUER: z.string().default(""),
  CPPLEARN_OIDC_CLIENT_ID: z.string().default(""),
  CPPLEARN_OIDC_CLIENT_SECRET: z.string().default(""),
  CPPLEARN_OIDC_REDIRECT_URI: z.string().default(""),

  // LLM
  LLM_PROVIDER_DEFAULT: llmProviderSchema.default(""),
  LLM_PROVIDER_BACKUP: llmProviderSchema.default(""),
  LLM_REASONING_DEFAULT: llmReasoningEffortSchema.default(""),
  LLM_REASONING_SUMMARY_DEFAULT: llmReasoningSummarySchema.default(""),
  LLM_THINKING_TYPE_DEFAULT: llmThinkingTypeSchema.default(""),
  LLM_THINKING_BUDGET_DEFAULT: llmThinkingBudgetSchema.default(""),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_BASE_URL: llmProviderBaseUrlSchema.default(""),
  OPENAI_MODEL: llmProviderModelSchema.default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  ANTHROPIC_BASE_URL: llmProviderBaseUrlSchema.default(""),
  ANTHROPIC_MODEL: llmProviderModelSchema.default(""),
  GOOGLE_API_KEY: z.string().default(""),
  GOOGLE_BASE_URL: llmProviderBaseUrlSchema.default(""),
  GOOGLE_MODEL: llmProviderModelSchema.default(""),
  XIAOMI_API_KEY: z.string().default(""),
  XIAOMI_BASE_URL: llmProviderBaseUrlSchema.default(""),
  XIAOMI_MODEL: llmProviderModelSchema.default(""),
  ALIBABA_API_KEY: z.string().default(""),
  ALIBABA_BASE_URL: llmProviderBaseUrlSchema.default(""),
  ALIBABA_MODEL: llmProviderModelSchema.default(""),
  MOONSHOTAI_API_KEY: z.string().default(""),
  MOONSHOTAI_BASE_URL: llmProviderBaseUrlSchema.default(""),
  MOONSHOTAI_MODEL: llmProviderModelSchema.default(""),
  OPENROUTER_API_KEY: z.string().default(""),
  OPENROUTER_BASE_URL: llmProviderBaseUrlSchema.default(""),
  OPENROUTER_MODEL: llmOpenRouterModelSchema.default(""),
  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_BASE_URL: llmProviderBaseUrlSchema.default(""),
  DEEPSEEK_MODEL: llmProviderModelSchema.default(""),
  MINIMAX_API_KEY: z.string().default(""),
  MINIMAX_BASE_URL: llmProviderBaseUrlSchema.default(""),
  MINIMAX_MODEL: llmProviderModelSchema.default(""),
  VOLCENGINE_API_KEY: z.string().default(""),
  VOLCENGINE_BASE_URL: llmProviderBaseUrlSchema.default(""),
  VOLCENGINE_MODEL: llmProviderModelSchema.default(""),
  XAI_API_KEY: z.string().default(""),
  XAI_BASE_URL: llmProviderBaseUrlSchema.default(""),
  XAI_MODEL: llmProviderModelSchema.default(""),
  ZAI_API_KEY: z.string().default(""),
  ZAI_BASE_URL: llmProviderBaseUrlSchema.default(""),
  ZAI_MODEL: llmProviderModelSchema.default(""),

  // Sandbox
  SANDBOX_RUNNER_URL: z.string().default("http://127.0.0.1:6100"),
  SANDBOX_RUNNER_IMAGE: z.string().default("cpp-runner:latest"),
  SANDBOX_RUNNER_RUNTIME: z.string().default("runsc"),
  SANDBOX_COMPILE_TIMEOUT_MS: z.coerce.number().default(10000),
  SANDBOX_TIMEOUT_MS: z.coerce.number().default(1000),
  SANDBOX_MEM_MB: z.coerce.number().default(256),
  SANDBOX_PIDS_LIMIT: z.coerce.number().default(64),

  // Redis / Worker
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  ROUND1_WORKER_ENABLED: z.coerce.boolean().default(true),
  ROUND1_WORKER_CONCURRENCY: z.coerce.number().default(3),

  // Other
  MIN_ASSIGNMENT_START_MINUTES: z.coerce.number().default(1),
  AUTOSAVE_INTERVAL_SECONDS: z.coerce.number().default(180),

  // R2
  R2_ACCOUNT_ID: z.string().default(""),
  R2_ACCESS_KEY_ID: z.string().default(""),
  R2_SECRET_ACCESS_KEY: z.string().default(""),
  R2_API_TOKEN: z.string().default(""),
  R2_PUBLIC_BASE_URL: z.string().default(""),
  CPPLEARN_FONT_PUBLIC_BASE_URL: z.string().default(""),

  // Sentry
  SENTRY_DSN: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
