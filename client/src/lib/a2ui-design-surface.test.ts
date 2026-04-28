import { describe, expect, it } from "vitest";

import {
  ROUND1_A2UI_MESSAGES,
  ROUND1_A2UI_SURFACE_ID,
  createRound1A2uiProcessor,
  getRound1A2uiCapabilities,
} from "./a2ui-design-surface";

describe("Round1 A2UI design surface", () => {
  it("advertises the installed A2UI v0.9 basic catalog", () => {
    const capabilities = getRound1A2uiCapabilities();

    expect(capabilities["v0.9"].supportedCatalogIds).toContain(
      "https://a2ui.org/specification/v0_9/basic_catalog.json",
    );
  });

  it("creates the design assistant surface from bundled messages", () => {
    const processor = createRound1A2uiProcessor();

    processor.processMessages(ROUND1_A2UI_MESSAGES);

    const surface = processor.model.getSurface(ROUND1_A2UI_SURFACE_ID);
    expect(surface?.componentsModel.get("root")?.type).toBe("Card");
    expect(surface?.componentsModel.get("note")?.type).toBe("TextField");
    expect(surface?.componentsModel.get("due-at")?.type).toBe("DateTimeInput");
    expect(surface?.componentsModel.get("enabled")?.type).toBe("CheckBox");
    expect(surface?.componentsModel.get("checkpoint-list")?.type).toBe("List");
    expect(surface?.dataModel.get("/draft/page")).toBe("CoachReport");
    expect(surface?.dataModel.get("/draft/enabled")).toBe(true);
  });
});
