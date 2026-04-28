import { z } from "zod";
import { registry } from "../../openapi/registry.js";

// Shared validators
export const UsernameSchema = z
  .string()
  .min(4)
  .max(20)
  .regex(/^[A-Za-z0-9]+$/);
export const PasswordSchema = z.string().min(8).max(128);
export const EmailSchema = z.string().email().max(255);

// Register request-challenge
export const RegisterRequestChallengeBody = registry.register(
  "RegisterRequestChallengeBody",
  z.object({
    email: EmailSchema,
    turnstileToken: z.string().optional(),
    powSolution: z
      .object({
        challengeId: z.string().uuid(),
        nonce: z.string().min(1),
      })
      .optional(),
  }),
);

// Verify code
export const VerifyCodeBody = registry.register(
  "VerifyCodeBody",
  z.object({
    challengeId: z.string().uuid(),
    code: z.string().length(6),
  }),
);

// Redeem link
export const RedeemLinkBody = registry.register(
  "RedeemLinkBody",
  z.object({
    challengeId: z.string().uuid(),
    token: z.string().min(1),
  }),
);

// Register complete
export const RegisterCompleteBody = registry.register(
  "RegisterCompleteBody",
  z.object({
    ticket: z.string().min(1),
    username: UsernameSchema,
    password: PasswordSchema,
    displayName: z.string().min(1).max(100).optional(),
    deviceIdHash: z.string().optional(),
  }),
);

// Password login
export const PasswordLoginBody = registry.register(
  "PasswordLoginBody",
  z.object({
    identifier: z.string().min(1).max(255), // username or email
    password: z.string().min(1),
    turnstileToken: z.string().optional(),
    powSolution: z
      .object({
        challengeId: z.string().uuid(),
        nonce: z.string().min(1),
      })
      .optional(),
    deviceIdHash: z.string().optional(),
  }),
);

// Password reset request
export const PasswordResetRequestBody = registry.register(
  "PasswordResetRequestBody",
  z.object({
    email: EmailSchema,
    turnstileToken: z.string().optional(),
    powSolution: z
      .object({
        challengeId: z.string().uuid(),
        nonce: z.string().min(1),
      })
      .optional(),
  }),
);

// Password reset complete
export const PasswordResetBody = registry.register(
  "PasswordResetBody",
  z.object({
    ticket: z.string().min(1),
    newPassword: PasswordSchema,
  }),
);

// Password change (logged in)
export const PasswordChangeBody = registry.register(
  "PasswordChangeBody",
  z.object({
    currentPassword: z.string().min(1),
    newPassword: PasswordSchema,
  }),
);

// Complete profile (OIDC register)
export const CompleteProfileBody = registry.register(
  "CompleteProfileBody",
  z.object({
    ticket: z.string().min(1),
    username: UsernameSchema,
    password: PasswordSchema,
    displayName: z.string().min(1).max(100).optional(),
    deviceIdHash: z.string().optional(),
  }),
);

// CSRF token response
export const CsrfTokenResponse = registry.register(
  "CsrfTokenResponse",
  z.object({
    csrfToken: z.string(),
  }),
);

// Auth providers response
export const AuthProvidersResponse = registry.register(
  "AuthProvidersResponse",
  z.object({
    providers: z.array(z.string()),
  }),
);

// Current browser session response
export const AuthSessionResponse = registry.register(
  "AuthSessionResponse",
  z.object({
    authenticated: z.boolean(),
    user: z
      .object({
        id: z.string().uuid(),
        username: z.string(),
        displayName: z.string(),
        role: z.enum(["student", "coach", "admin"]),
        status: z.string(),
      })
      .optional(),
  }),
);

// Passkey login options body
export const PasskeyLoginOptionsBody = registry.register(
  "PasskeyLoginOptionsBody",
  z.object({}).passthrough(),
);

const PasskeyCredentialResponseBody = z
  .object({
    id: z.string().min(1),
    rawId: z.string().optional(),
    response: z.record(z.string(), z.unknown()),
    type: z.string().optional(),
    clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
    authenticatorAttachment: z.string().optional(),
  })
  .passthrough();

// Passkey login verify body
export const PasskeyLoginVerifyBody = registry.register(
  "PasskeyLoginVerifyBody",
  PasskeyCredentialResponseBody,
);

// Passkey register options
export const PasskeyRegisterOptionsBody = registry.register(
  "PasskeyRegisterOptionsBody",
  z.object({}).passthrough(),
);

// Passkey register verify
export const PasskeyRegisterVerifyBody = registry.register(
  "PasskeyRegisterVerifyBody",
  PasskeyCredentialResponseBody,
);

// TOTP enroll start (empty body)
export const TotpEnrollStartBody = registry.register("TotpEnrollStartBody", z.object({}));

// TOTP enroll verify
export const TotpEnrollVerifyBody = registry.register(
  "TotpEnrollVerifyBody",
  z.object({
    code: z.string().length(6),
  }),
);

// TOTP reauth
export const TotpReauthBody = registry.register(
  "TotpReauthBody",
  z.object({
    code: z.string().length(6),
  }),
);

// Password reauth
export const PasswordReauthBody = registry.register(
  "PasswordReauthBody",
  z.object({
    password: z.string().min(1),
  }),
);

// Email change request
export const EmailChangeRequestBody = registry.register(
  "EmailChangeRequestBody",
  z.object({
    newEmail: EmailSchema,
    turnstileToken: z.string().optional(),
  }),
);

// Email change confirm
export const EmailChangeConfirmBody = registry.register(
  "EmailChangeConfirmBody",
  z.object({
    ticket: z.string().min(1),
  }),
);

// Admin update user
export const AdminUpdateUserBody = registry.register(
  "AdminUpdateUserBody",
  z.object({
    role: z.enum(["student", "coach", "admin"]).optional(),
  }),
);
