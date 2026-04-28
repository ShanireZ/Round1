import { MessageProcessor, type A2uiClientAction, type A2uiMessage } from "@a2ui/web_core/v0_9";
import { basicCatalog } from "@a2ui/react/v0_9";

export const ROUND1_A2UI_SURFACE_ID = "round1-design-assistant";

export const ROUND1_A2UI_MESSAGES = [
  {
    version: "v0.9",
    createSurface: {
      surfaceId: ROUND1_A2UI_SURFACE_ID,
      catalogId: basicCatalog.id,
      sendDataModel: true,
    },
  },
  {
    version: "v0.9",
    updateDataModel: {
      surfaceId: ROUND1_A2UI_SURFACE_ID,
      path: "/draft",
      value: {
        page: "CoachReport",
        density: 72,
        target: "utility-first, token-bound, keyboard-safe",
      },
    },
  },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: ROUND1_A2UI_SURFACE_ID,
      components: [
        {
          id: "root",
          component: "Card",
          child: "layout",
        },
        {
          id: "layout",
          component: "Column",
          children: ["heading", "summary", "control-row", "notes"],
        },
        {
          id: "heading",
          component: "Text",
          variant: "h3",
          text: "A2UI design surface",
        },
        {
          id: "summary",
          component: "Text",
          text: "Agent payloads render inside the Round1 token bridge, so generated UI can be reviewed without escaping the established visual system.",
        },
        {
          id: "control-row",
          component: "Row",
          children: ["density", "status", "apply"],
          justify: "spaceBetween",
          align: "center",
        },
        {
          id: "density",
          component: "Slider",
          label: "信息密度",
          min: 40,
          max: 100,
          value: { path: "/draft/density" },
        },
        {
          id: "status",
          component: "ChoicePicker",
          label: "验收重点",
          variant: "multipleSelection",
          displayStyle: "chips",
          options: [
            { label: "Light/Dark", value: "theme" },
            { label: "移动端", value: "mobile" },
            { label: "键盘", value: "keyboard" },
          ],
          value: ["theme", "keyboard"],
        },
        {
          id: "apply",
          component: "Button",
          variant: "primary",
          child: "apply-label",
          action: {
            event: {
              name: "round1_a2ui_review",
              context: {
                page: { path: "/draft/page" },
                density: { path: "/draft/density" },
                target: { path: "/draft/target" },
              },
            },
          },
        },
        {
          id: "apply-label",
          component: "Text",
          text: "记录检查点",
        },
        {
          id: "notes",
          component: "Text",
          variant: "caption",
          text: "A2UI is allowed here as an agent-facing renderer; production pages still use the local Radix/shadcn primitives and Round1 tokens.",
        },
      ],
    },
  },
] satisfies A2uiMessage[];

export function createRound1A2uiProcessor(actionHandler?: (action: A2uiClientAction) => void) {
  return new MessageProcessor([basicCatalog], actionHandler);
}

export function getRound1A2uiCapabilities() {
  return createRound1A2uiProcessor().getClientCapabilities();
}
