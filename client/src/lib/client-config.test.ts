import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchClientRuntimeConfig, getAutosaveIntervalMs } from "./client-config";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

describe("client runtime config", () => {
  it("fetches non-sensitive frontend runtime config", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          turnstileSiteKey: "site-key",
          powEnabled: true,
          powBaseDifficulty: 18,
          autosaveIntervalSeconds: 120,
          examDraftTtlMinutes: 1440,
          availableExamTypes: ["CSP-J"],
          availableDifficulties: ["easy", "medium", "hard"],
          enabledAuthProviders: ["password", "passkey"],
          authProviderPlaceholders: ["qq"],
        },
      }),
    });

    const config = await fetchClientRuntimeConfig();

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/config/client", {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    expect(config.autosaveIntervalSeconds).toBe(120);
    expect(config.enabledAuthProviders).toContain("passkey");
    expect(config.authProviderPlaceholders).toEqual(["qq"]);
  });

  it("derives autosave interval milliseconds with a safe fallback", () => {
    expect(getAutosaveIntervalMs({ autosaveIntervalSeconds: 45 })).toBe(45_000);
    expect(getAutosaveIntervalMs({ autosaveIntervalSeconds: 0 })).toBe(180_000);
    expect(getAutosaveIntervalMs(null)).toBe(180_000);
  });
});
