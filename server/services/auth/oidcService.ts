import crypto from "node:crypto";
import * as client from "openid-client";
import { env } from "../../../config/env.js";

// ── Lazy-init singleton ──────────────────────────────────────────────

let cachedConfig: client.Configuration | null = null;

export async function getOidcClient(): Promise<client.Configuration> {
  if (cachedConfig) return cachedConfig;

  const issuerUrl = new URL(env.CPPLEARN_OIDC_ISSUER);
  cachedConfig = await client.discovery(
    issuerUrl,
    env.CPPLEARN_OIDC_CLIENT_ID,
    env.CPPLEARN_OIDC_CLIENT_SECRET,
  );
  return cachedConfig;
}

// ── Build authorization URL ──────────────────────────────────────────

export async function buildAuthorizationUrl(
  intent: "login" | "register" | "bind",
  sessionData?: { userId: string; sessionIdHash: string; sessionVersion: number },
): Promise<{ url: string; state: string; nonce: string; codeVerifier: string }> {
  const config = await getOidcClient();

  const statePayload = JSON.stringify({ intent, ...sessionData });
  const state = Buffer.from(statePayload).toString("base64url");
  const nonce = crypto.randomBytes(32).toString("base64url");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");

  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const parameters = new URLSearchParams({
    redirect_uri: env.CPPLEARN_OIDC_REDIRECT_URI,
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const url = client.buildAuthorizationUrl(config, parameters);

  return { url: url.href, state, nonce, codeVerifier };
}

// ── Handle callback ──────────────────────────────────────────────────

export async function handleCallback(
  currentUrl: URL,
  expectedState: string,
  nonce: string,
  codeVerifier: string,
): Promise<{ sub: string; email?: string; name?: string }> {
  const config = await getOidcClient();

  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedNonce: nonce,
    expectedState,
  });

  const claims = tokens.claims();
  if (!claims || !claims.sub) {
    throw new Error("OIDC token missing sub claim");
  }

  return {
    sub: claims.sub,
    email: claims.email as string | undefined,
    name: claims.name as string | undefined,
  };
}
