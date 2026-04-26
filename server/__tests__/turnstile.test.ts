/**
 * Tests for: Cloudflare Turnstile verification (server/services/auth/turnstileService.ts)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to mock the env before importing the service
vi.mock("../../config/env.js", () => ({
  env: {
    AUTH_TURNSTILE_SECRET_KEY: "",
  },
}));

vi.mock("../logger.js", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Turnstile Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when secret key is not configured (graceful bypass)", async () => {
    const { env } = await import("../../config/env.js");
    const mutableEnv = env as typeof env & { AUTH_TURNSTILE_SECRET_KEY: string };
    mutableEnv.AUTH_TURNSTILE_SECRET_KEY = "";

    const { verifyTurnstile } = await import("../services/auth/turnstileService.js");
    const result = await verifyTurnstile("any-token", "127.0.0.1");
    expect(result).toBe(true);
  });

  it("returns true when Cloudflare responds with success", async () => {
    const { env } = await import("../../config/env.js");
    const mutableEnv = env as typeof env & { AUTH_TURNSTILE_SECRET_KEY: string };
    mutableEnv.AUTH_TURNSTILE_SECRET_KEY = "test-secret-key";

    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { verifyTurnstile } = await import("../services/auth/turnstileService.js");
    const result = await verifyTurnstile("valid-token", "192.168.1.1");
    expect(result).toBe(true);

    // Verify it called the correct endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }),
    );
  });

  it("returns false when Cloudflare responds with failure", async () => {
    const { env } = await import("../../config/env.js");
    const mutableEnv = env as typeof env & { AUTH_TURNSTILE_SECRET_KEY: string };
    mutableEnv.AUTH_TURNSTILE_SECRET_KEY = "test-secret-key";

    const mockFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: false,
          "error-codes": ["invalid-input-response"],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { verifyTurnstile } = await import("../services/auth/turnstileService.js");
    const result = await verifyTurnstile("invalid-token", "192.168.1.1");
    expect(result).toBe(false);
  });

  it("returns false on network error", async () => {
    const { env } = await import("../../config/env.js");
    const mutableEnv = env as typeof env & { AUTH_TURNSTILE_SECRET_KEY: string };
    mutableEnv.AUTH_TURNSTILE_SECRET_KEY = "test-secret-key";

    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    const { verifyTurnstile } = await import("../services/auth/turnstileService.js");
    const result = await verifyTurnstile("some-token", "192.168.1.1");
    expect(result).toBe(false);
  });

  it("sends remote IP to Cloudflare", async () => {
    const { env } = await import("../../config/env.js");
    const mutableEnv = env as typeof env & { AUTH_TURNSTILE_SECRET_KEY: string };
    mutableEnv.AUTH_TURNSTILE_SECRET_KEY = "test-secret-key";

    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { verifyTurnstile } = await import("../services/auth/turnstileService.js");
    await verifyTurnstile("token-123", "10.0.0.1");

    const callBody = mockFetch.mock.calls[0]?.[1]?.body;
    expect(callBody).toBeInstanceOf(URLSearchParams);
    expect((callBody as URLSearchParams).get("remoteip")).toBe("10.0.0.1");
    expect((callBody as URLSearchParams).get("response")).toBe("token-123");
    expect((callBody as URLSearchParams).get("secret")).toBe("test-secret-key");
  });
});
