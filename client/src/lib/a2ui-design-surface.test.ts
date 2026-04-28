import { describe, expect, it } from "vitest";

import {
  ROUND1_A2UI_MESSAGES,
  ROUND1_A2UI_SURFACE_ID,
  assertRound1A2uiMessages,
  createRound1A2uiMessages,
  createRound1A2uiProcessor,
  getRound1A2uiBasicCatalogComponents,
  getRound1A2uiCapabilities,
} from "./a2ui-design-surface";

describe("Round1 A2UI design surface", () => {
  it("advertises the installed A2UI v0.9 basic catalog", () => {
    const capabilities = getRound1A2uiCapabilities();

    expect(capabilities["v0.9"].supportedCatalogIds).toContain(
      "https://a2ui.org/specification/v0_9/basic_catalog.json",
    );
  });

  it("keeps the local catalog summary aligned with the installed basic catalog", () => {
    expect(getRound1A2uiBasicCatalogComponents()).toEqual(
      expect.arrayContaining([
        "AudioPlayer",
        "Button",
        "Card",
        "CheckBox",
        "ChoicePicker",
        "Column",
        "DateTimeInput",
        "Divider",
        "Icon",
        "Image",
        "List",
        "Modal",
        "Row",
        "Slider",
        "Tabs",
        "Text",
        "TextField",
        "Video",
      ]),
    );
  });

  it("creates the design assistant surface from bundled messages", () => {
    const processor = createRound1A2uiProcessor();
    const messages = createRound1A2uiMessages();

    expect(messages).toEqual(ROUND1_A2UI_MESSAGES);
    processor.processMessages(messages);

    const surface = processor.model.getSurface(ROUND1_A2UI_SURFACE_ID);
    expect(surface?.componentsModel.get("root")?.type).toBe("Card");
    expect(surface?.componentsModel.get("note")?.type).toBe("TextField");
    expect(surface?.componentsModel.get("due-at")?.type).toBe("DateTimeInput");
    expect(surface?.componentsModel.get("enabled")?.type).toBe("CheckBox");
    expect(surface?.componentsModel.get("checkpoint-list")?.type).toBe("List");
    expect(surface?.componentsModel.get("design-tabs")?.type).toBe("Tabs");
    expect(surface?.componentsModel.get("section-divider")?.type).toBe("Divider");
    expect(surface?.componentsModel.get("checkpoint-token-icon")?.type).toBe("Icon");
    expect(surface?.componentsModel.get("catalog-list")?.type).toBe("List");
    expect(surface?.dataModel.get("/draft/page")).toBe("CoachReport");
    expect(surface?.dataModel.get("/draft/enabled")).toBe(true);
  });

  it("rejects A2UI payloads that drift from installed component schemas", () => {
    expect(() =>
      assertRound1A2uiMessages([
        {
          version: "v0.9",
          createSurface: {
            surfaceId: ROUND1_A2UI_SURFACE_ID,
            catalogId: "https://a2ui.org/specification/v0_9/basic_catalog.json",
          },
        },
        {
          version: "v0.9",
          updateComponents: {
            surfaceId: ROUND1_A2UI_SURFACE_ID,
            components: [
              {
                id: "root",
                component: "Slider",
                minValue: 0,
                maxValue: 100,
                value: { path: "/draft/density" },
              },
            ],
          },
        },
      ]),
    ).toThrow(/Invalid A2UI Slider component "root"/);
  });
});
