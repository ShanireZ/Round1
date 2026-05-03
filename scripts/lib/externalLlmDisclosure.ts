import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const externalLlmConsentSchema = z.object({
  schemaVersion: z.literal("round1.external-llm-consent/2026-05-03.1"),
  approvedBy: z.string().min(1),
  approvedAt: z.iso.datetime(),
  purpose: z.string().min(1),
  allowedProviders: z.array(z.string().min(1)).min(1),
  allowedBaseUrlHosts: z.array(z.string().min(1)).optional().default([]),
  allowedDataCategories: z.array(z.string().min(1)).min(1),
  acknowledgeQuestionBankTransfer: z.literal(true),
  acknowledgeNoPolicyBypass: z.literal(true),
});

export type ExternalLlmConsent = z.infer<typeof externalLlmConsentSchema>;

export interface ExternalLlmDisclosure {
  allowed: true;
  operation: string;
  purpose: string;
  acknowledgedAt: string;
  dataCategories: string[];
  consentPath: string;
  approvedBy: string;
  approvedAt: string;
  allowedProviders: string[];
  plannedProviders: string[];
  plannedBaseUrlHosts: string[];
  policyNote: string;
}

export function assertExternalLlmAllowed(params: {
  allowExternalLlm: boolean;
  operation: string;
  purpose?: string;
  dataCategories: string[];
  consentPath?: string;
  plannedProviders?: string[];
  plannedBaseUrls?: string[];
  skipBecauseNoLlmCalls?: boolean;
}): ExternalLlmDisclosure | null {
  if (params.skipBecauseNoLlmCalls) {
    return null;
  }

  if (!params.allowExternalLlm) {
    throw new Error(
      [
        `External LLM calls are blocked for ${params.operation}.`,
        "This workflow sends question-bank content to the configured LLM provider(s), including stems, options, code, answers, explanations, and metadata.",
        "Re-run with --allow-external-llm and --external-llm-consent <consent.json> after confirming this data transfer is permitted.",
        "Optionally add --external-llm-purpose <text> so the generated report records why external review/generation was allowed.",
      ].join(" "),
    );
  }

  if (!params.consentPath) {
    throw new Error(
      [
        `External LLM calls are missing a consent artifact for ${params.operation}.`,
        "Create a consent JSON with schemaVersion round1.external-llm-consent/2026-05-03.1 and pass it with --external-llm-consent <path>.",
        "The consent must explicitly acknowledge question-bank transfer and list allowed providers/data categories.",
      ].join(" "),
    );
  }

  const consentPath = path.resolve(process.cwd(), params.consentPath);
  const consent = externalLlmConsentSchema.parse(JSON.parse(fs.readFileSync(consentPath, "utf8")));
  const plannedProviders = [...new Set((params.plannedProviders ?? []).map(normalizeToken))].filter(
    Boolean,
  );
  const allowedProviders = new Set(consent.allowedProviders.map(normalizeToken));
  const disallowedProviders = plannedProviders.filter((provider) => !allowedProviders.has(provider));
  if (disallowedProviders.length > 0) {
    throw new Error(
      `External LLM consent does not allow provider(s): ${disallowedProviders.join(", ")}`,
    );
  }

  const allowedDataCategories = new Set(consent.allowedDataCategories.map(normalizeToken));
  const missingDataCategories = params.dataCategories.filter(
    (category) => !allowedDataCategories.has("*") && !allowedDataCategories.has(normalizeToken(category)),
  );
  if (missingDataCategories.length > 0) {
    throw new Error(
      `External LLM consent does not allow data category/categories: ${missingDataCategories.join(
        ", ",
      )}`,
    );
  }

  const plannedBaseUrlHosts = [...new Set((params.plannedBaseUrls ?? []).map(hostFromUrl))]
    .filter((host): host is string => Boolean(host))
    .sort((left, right) => left.localeCompare(right));
  const allowedBaseUrlHosts = new Set(consent.allowedBaseUrlHosts.map(normalizeHost));
  if (allowedBaseUrlHosts.size > 0) {
    const disallowedHosts = plannedBaseUrlHosts.filter((host) => !allowedBaseUrlHosts.has(host));
    if (disallowedHosts.length > 0) {
      throw new Error(
        `External LLM consent does not allow provider host(s): ${disallowedHosts.join(", ")}`,
      );
    }
  }

  return {
    allowed: true,
    operation: params.operation,
    purpose: params.purpose?.trim() || consent.purpose,
    acknowledgedAt: new Date().toISOString(),
    dataCategories: params.dataCategories,
    consentPath,
    approvedBy: consent.approvedBy,
    approvedAt: consent.approvedAt,
    allowedProviders: consent.allowedProviders,
    plannedProviders,
    plannedBaseUrlHosts,
    policyNote:
      "Explicit operator acknowledgement only; this does not bypass platform, provider, or repository policy checks.",
  };
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

function hostFromUrl(value: string): string | undefined {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return undefined;
  }
}
