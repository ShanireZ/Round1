import "express-serve-static-core";
import "express-session";

declare module "express-serve-static-core" {
  interface Response {
    ok<T>(data: T, status?: number): this;
    fail(
      code: string,
      message: string,
      status?: number,
      details?: unknown,
    ): this;
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
    role: string;
    sessionVersion: number;
    createdAt: number; // epoch ms — absolute TTL tracking
    lastStrongAuthAt: number; // epoch ms
    totpPendingSecret: string; // encrypted TOTP secret during enrollment
    oidcState?: { state: string; nonce: string; codeVerifier: string };
    completeProfileTicketHash?: string;
    completeProfileData?: {
      provider: string;
      providerUserId: string;
      providerEmail?: string;
      displayNameHint?: string;
    };
    passkeyChallenge?: string;
    passkeyUserId?: string;
  }
}
