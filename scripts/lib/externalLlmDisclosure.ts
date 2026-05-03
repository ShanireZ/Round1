export interface ExternalLlmDisclosure {
  allowed: true;
  operation: string;
  purpose: string;
  acknowledgedAt: string;
  dataCategories: string[];
  policyNote: string;
}

export function assertExternalLlmAllowed(params: {
  allowExternalLlm: boolean;
  operation: string;
  purpose?: string;
  dataCategories: string[];
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
        "Re-run with --allow-external-llm after confirming this data transfer is permitted.",
        "Optionally add --external-llm-purpose <text> so the generated report records why external review/generation was allowed.",
      ].join(" "),
    );
  }

  return {
    allowed: true,
    operation: params.operation,
    purpose: params.purpose?.trim() || "question quality review and generation",
    acknowledgedAt: new Date().toISOString(),
    dataCategories: params.dataCategories,
    policyNote:
      "Explicit operator acknowledgement only; this does not bypass platform, provider, or repository policy checks.",
  };
}
