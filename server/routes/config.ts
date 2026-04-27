import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { EXAM_TYPES } from "../../config/examTypes.js";
import { registry } from "../openapi/registry.js";
import { getRuntimeNumberSetting } from "../services/runtimeConfigService.js";

export const ClientConfigData = registry.register(
  "ClientConfigData",
  z.object({
    turnstileSiteKey: z.string(),
    powEnabled: z.boolean(),
    powBaseDifficulty: z.number(),
    autosaveIntervalSeconds: z.number(),
    examDraftTtlMinutes: z.number(),
    availableExamTypes: z.array(z.string()),
    availableDifficulties: z.array(z.string()),
    enabledAuthProviders: z.array(z.string()),
  }),
);

registry.registerPath({
  method: "get",
  path: "/api/v1/config/client",
  summary: "Frontend runtime configuration",
  responses: {
    200: {
      description: "Non-sensitive runtime configuration for the frontend",
      content: {
        "application/json": {
          schema: z.object({
            success: z.literal(true),
            data: ClientConfigData,
          }),
        },
      },
    },
  },
});

export const configRouter = Router();

// GET /api/v1/config/client - public non-sensitive runtime config for the frontend.
configRouter.get("/config/client", (_req, res) => {
  const enabledAuthProviders: string[] = ["password", "passkey"];
  if (env.CPPLEARN_OIDC_ISSUER) {
    enabledAuthProviders.push("cpplearn");
  }
  if (env.AUTH_PROVIDER_QQ_ENABLED) {
    enabledAuthProviders.push("qq");
  }

  res.ok({
    turnstileSiteKey: env.AUTH_TURNSTILE_SITE_KEY,
    powEnabled: env.AUTH_POW_ENABLED,
    powBaseDifficulty: env.AUTH_POW_BASE_DIFFICULTY,
    autosaveIntervalSeconds: getRuntimeNumberSetting(
      "exam.autosaveIntervalSeconds",
      env.AUTOSAVE_INTERVAL_SECONDS,
    ),
    examDraftTtlMinutes: getRuntimeNumberSetting(
      "exam.draftTtlMinutes",
      env.EXAM_DRAFT_TTL_MINUTES,
    ),
    availableExamTypes: [...EXAM_TYPES],
    availableDifficulties: ["easy", "medium", "hard"],
    enabledAuthProviders,
  });
});
