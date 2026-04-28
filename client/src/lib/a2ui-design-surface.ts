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
        dueAt: "2026-04-28T18:00:00+08:00",
        enabled: true,
        note: "Validate agent-authored surfaces against Round1 tokens before production use.",
        checks: ["theme", "keyboard"],
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
          children: ["heading", "summary", "form-grid", "control-row", "checkpoint-list", "notes"],
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
          id: "form-grid",
          component: "Column",
          children: ["note", "schedule-row"],
        },
        {
          id: "note",
          component: "TextField",
          label: "Agent 备注",
          textFieldType: "longText",
          value: { path: "/draft/note" },
        },
        {
          id: "schedule-row",
          component: "Row",
          children: ["due-at", "enabled"],
          justify: "spaceBetween",
          align: "end",
        },
        {
          id: "due-at",
          component: "DateTimeInput",
          label: "验收时间",
          value: { path: "/draft/dueAt" },
          enableDate: true,
          enableTime: true,
        },
        {
          id: "enabled",
          component: "CheckBox",
          label: "启用 agent surface 验收",
          value: { path: "/draft/enabled" },
        },
        {
          id: "control-row",
          component: "Column",
          children: ["density", "status", "apply"],
        },
        {
          id: "density",
          component: "Slider",
          label: "信息密度",
          minValue: 40,
          maxValue: 100,
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
          selections: { path: "/draft/checks" },
          maxAllowedSelections: 3,
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
                checks: { path: "/draft/checks" },
                dueAt: { path: "/draft/dueAt" },
                enabled: { path: "/draft/enabled" },
                note: { path: "/draft/note" },
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
          id: "checkpoint-list",
          component: "List",
          children: [
            "checkpoint-token-card",
            "checkpoint-markdown-card",
            "checkpoint-guardrail-card",
          ],
          direction: "vertical",
        },
        {
          id: "checkpoint-token-card",
          component: "Card",
          child: "checkpoint-token-content",
        },
        {
          id: "checkpoint-token-content",
          component: "Row",
          children: ["checkpoint-token-label", "checkpoint-token-status"],
          justify: "spaceBetween",
          align: "center",
        },
        {
          id: "checkpoint-token-label",
          component: "Text",
          text: "Token bridge",
        },
        {
          id: "checkpoint-token-status",
          component: "Text",
          variant: "caption",
          text: "Ready",
        },
        {
          id: "checkpoint-markdown-card",
          component: "Card",
          child: "checkpoint-markdown-content",
        },
        {
          id: "checkpoint-markdown-content",
          component: "Row",
          children: ["checkpoint-markdown-label", "checkpoint-markdown-status"],
          justify: "spaceBetween",
          align: "center",
        },
        {
          id: "checkpoint-markdown-label",
          component: "Text",
          text: "Sanitized markdown",
        },
        {
          id: "checkpoint-markdown-status",
          component: "Text",
          variant: "caption",
          text: "Ready",
        },
        {
          id: "checkpoint-guardrail-card",
          component: "Card",
          child: "checkpoint-guardrail-content",
        },
        {
          id: "checkpoint-guardrail-content",
          component: "Row",
          children: ["checkpoint-guardrail-label", "checkpoint-guardrail-status"],
          justify: "spaceBetween",
          align: "center",
        },
        {
          id: "checkpoint-guardrail-label",
          component: "Text",
          text: "Payload guardrails",
        },
        {
          id: "checkpoint-guardrail-status",
          component: "Text",
          variant: "caption",
          text: "Next",
        },
        {
          id: "notes",
          component: "Text",
          variant: "caption",
          text: "**A2UI** is allowed here as an agent-facing renderer; production pages still use the local Radix/shadcn primitives and Round1 tokens.",
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
