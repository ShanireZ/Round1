import { describe, expect, it } from "vitest";

import { ROUND1_A2UI_CATALOG_ID, round1A2uiCatalog } from "@/components/a2ui/round1A2uiCatalog";
import {
  ROUND1_A2UI_MESSAGES,
  ROUND1_A2UI_SURFACE_ID,
  assertRound1A2uiMessages,
  createRound1A2uiMessages,
  createRound1A2uiProcessor,
  formatRound1A2uiActionSummary,
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
    expect(surface?.componentsModel.get("media-image")?.type).toBe("Image");
    expect(surface?.componentsModel.get("media-modal")?.type).toBe("Modal");
    expect(surface?.componentsModel.get("media-video")?.type).toBe("Video");
    expect(surface?.componentsModel.get("media-audio")?.type).toBe("AudioPlayer");
    expect(surface?.dataModel.get("/draft/page")).toBe("CoachReport");
    expect(surface?.dataModel.get("/draft/enabled")).toBe(true);
  });

  it("can render Round1 design-system BYOC components through a guarded catalog", () => {
    const processor = createRound1A2uiProcessor(undefined, round1A2uiCatalog);
    const messages = createRound1A2uiMessages({
      catalog: round1A2uiCatalog,
      includeRound1Snapshot: true,
    });

    assertRound1A2uiMessages(messages, round1A2uiCatalog);
    processor.processMessages(messages);

    const surface = processor.model.getSurface(ROUND1_A2UI_SURFACE_ID);
    expect(messages[0]).toMatchObject({
      createSurface: { catalogId: ROUND1_A2UI_CATALOG_ID },
    });
    expect(surface?.componentsModel.get("round1-report-snapshot")?.type).toBe(
      "Round1CoachReportSnapshot",
    );
    expect(surface?.componentsModel.get("round1-class-snapshot")?.type).toBe(
      "Round1CoachClassSnapshot",
    );
    expect(surface?.componentsModel.get("round1-class-detail-snapshot")?.type).toBe(
      "Round1CoachClassDetailSnapshot",
    );
    expect(surface?.componentsModel.get("round1-student-class-snapshot")?.type).toBe(
      "Round1StudentClassSnapshot",
    );
    expect(surface?.componentsModel.get("round1-security-snapshot")?.type).toBe(
      "Round1AccountSecuritySnapshot",
    );
    expect(surface?.componentsModel.get("round1-auth-snapshot")?.type).toBe(
      "Round1AuthEntrySnapshot",
    );
    expect(surface?.componentsModel.get("round1-admin-question-snapshot")?.type).toBe(
      "Round1AdminQuestionSnapshot",
    );
    expect(surface?.componentsModel.get("round1-admin-paper-snapshot")?.type).toBe(
      "Round1AdminPaperSnapshot",
    );
    expect(surface?.componentsModel.get("round1-admin-import-snapshot")?.type).toBe(
      "Round1AdminImportSnapshot",
    );
    expect(surface?.dataModel.get("/draft/students")).toBe(128);
    expect(surface?.dataModel.get("/draft/printReady")).toBe(true);
    expect(surface?.dataModel.get("/draft/openAssignments")).toBe(4);
    expect(surface?.dataModel.get("/draft/detailMembers")).toBe(32);
    expect(surface?.dataModel.get("/draft/joinedClasses")).toBe(2);
    expect(surface?.dataModel.get("/draft/emailVerified")).toBe(true);
    expect(surface?.dataModel.get("/draft/authPages")).toBe(5);
    expect(surface?.dataModel.get("/draft/authCallbackReady")).toBe(true);
    expect(surface?.dataModel.get("/draft/adminPublishedQuestions")).toBe(46);
    expect(surface?.dataModel.get("/draft/adminPublishedPapers")).toBe(18);
    expect(surface?.dataModel.get("/draft/adminSharedSummaryReady")).toBe(true);
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

  it("rejects function actions until an explicit agent bridge exists", () => {
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
                component: "Button",
                child: "label",
                action: {
                  functionCall: {
                    call: "unsafe_agent_function",
                    args: {},
                    returnType: "void",
                  },
                },
              },
              {
                id: "label",
                component: "Text",
                text: "Run",
              },
            ],
          },
        },
      ]),
    ).toThrow(/function actions are not allowed/);
  });

  it("rejects dynamic function bindings until catalog functions are audited", () => {
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
                component: "Text",
                text: {
                  call: "unsafe_agent_function",
                  args: {},
                  returnType: "string",
                },
              },
            ],
          },
        },
      ]),
    ).toThrow(/function bindings are not allowed/);
  });

  it("rejects data model paths that only share the draft prefix", () => {
    expect(() =>
      assertRound1A2uiMessages([
        {
          version: "v0.9",
          updateDataModel: {
            surfaceId: ROUND1_A2UI_SURFACE_ID,
            path: "/drafty",
            value: { enabled: false },
          },
        },
      ]),
    ).toThrow(/escapes \/draft/);
  });

  it("rejects component data bindings outside the draft root", () => {
    expect(() =>
      assertRound1A2uiMessages([
        {
          version: "v0.9",
          updateComponents: {
            surfaceId: ROUND1_A2UI_SURFACE_ID,
            components: [
              {
                id: "root",
                component: "Text",
                text: { path: "/profile/displayName" },
              },
            ],
          },
        },
      ]),
    ).toThrow(/data binding escapes \/draft/);
  });

  it("rejects remote media URLs in local design surfaces", () => {
    expect(() =>
      assertRound1A2uiMessages([
        {
          version: "v0.9",
          updateComponents: {
            surfaceId: ROUND1_A2UI_SURFACE_ID,
            components: [
              {
                id: "root",
                component: "Image",
                url: "https://example.invalid/agent-image.png",
              },
            ],
          },
        },
      ]),
    ).toThrow(/media URL is not allowed/);
  });

  it("validates dynamic list component references", () => {
    expect(() =>
      assertRound1A2uiMessages([
        {
          version: "v0.9",
          updateComponents: {
            surfaceId: ROUND1_A2UI_SURFACE_ID,
            components: [
              {
                id: "root",
                component: "List",
                children: {
                  componentId: "missing-row-template",
                  path: "/draft/items",
                },
                direction: "vertical",
              },
            ],
          },
        },
      ]),
    ).toThrow(/missing-row-template/);
  });

  it("formats action summaries without assuming optional context exists", () => {
    const action = {
      name: "round1_a2ui_review",
    } as Parameters<typeof formatRound1A2uiActionSummary>[0];

    expect(formatRound1A2uiActionSummary(action)).toBe("round1_a2ui_review · 未设置 · 0项");
  });
});
