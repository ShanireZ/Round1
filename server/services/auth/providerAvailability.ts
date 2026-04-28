import { env } from "../../../config/env.js";

export type AuthProviderId = "password" | "passkey" | "cpplearn" | "qq";

export function getEnabledAuthProviders(): AuthProviderId[] {
  const providers: AuthProviderId[] = ["password", "passkey"];

  if (env.CPPLEARN_OIDC_ISSUER) {
    providers.push("cpplearn");
  }

  return providers;
}

export function getAuthProviderPlaceholders(): AuthProviderId[] {
  return env.AUTH_PROVIDER_QQ_ENABLED ? ["qq"] : [];
}
