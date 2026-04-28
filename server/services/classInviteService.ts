import { createHash, randomBytes } from "node:crypto";

export function createClassInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashClassInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
