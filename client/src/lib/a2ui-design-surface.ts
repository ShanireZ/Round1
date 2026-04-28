import { MessageProcessor, type A2uiClientAction, type A2uiMessage } from "@a2ui/web_core/v0_9";
import { basicCatalog } from "@a2ui/react/v0_9";

const A2UI_VERSION = "v0.9";
const ROUND1_A2UI_DRAFT_ROOT = "/draft";
const ROUND1_A2UI_ACTION_NAME = "round1_a2ui_review";
const ROUND1_A2UI_LIMITS = {
  maxMessages: 4,
  maxComponents: 80,
} as const;

export const ROUND1_A2UI_SURFACE_ID = "round1-design-assistant";

const ROUND1_A2UI_DRAFT = {
  page: "CoachReport",
  density: 72,
  dueAt: "2026-04-28T18:00:00+08:00",
  enabled: true,
  note: "Validate agent-authored surfaces against Round1 tokens before production use.",
  checks: ["theme", "keyboard"],
  target: "utility-first, token-bound, keyboard-safe",
};

const ROUND1_A2UI_COPY = {
  heading: "A2UI design surface",
  summary:
    "Agent payloads render inside the Round1 token bridge, so generated UI can be reviewed without escaping the established visual system.",
  actionLabel: "记录检查点",
  notes:
    "**A2UI** is the primary agent-facing design surface for generated UI review; production pages still compose local primitives through Round1 tokens.",
};

const ROUND1_A2UI_FOCUS_OPTIONS = [
  { label: "Light/Dark", value: "theme" },
  { label: "移动端", value: "mobile" },
  { label: "键盘", value: "keyboard" },
];

const ROUND1_A2UI_CHECKPOINTS = [
  { key: "token", label: "Token bridge", status: "Ready", icon: "check" },
  { key: "markdown", label: "Sanitized markdown", status: "Ready", icon: "check" },
  { key: "guardrail", label: "Payload guardrails", status: "Active", icon: "lock" },
] as const;

type Round1A2uiDraft = typeof ROUND1_A2UI_DRAFT;

type A2uiComponentPayload = {
  id: string;
  component: string;
  [key: string]: unknown;
};

function bindDraftField(field: keyof Round1A2uiDraft) {
  return { path: `${ROUND1_A2UI_DRAFT_ROOT}/${field}` };
}

function toKebab(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function createCatalogSummaryComponents(): A2uiComponentPayload[] {
  const catalogComponentNames = getRound1A2uiBasicCatalogComponents();
  const itemIds = catalogComponentNames.map((name) => `catalog-entry-${toKebab(name)}`);

  return [
    {
      id: "catalog-list",
      component: "List",
      children: itemIds,
      direction: "vertical",
    },
    ...catalogComponentNames.map((name, index) => ({
      id: itemIds[index] ?? `catalog-${index}`,
      component: "Text",
      variant: "caption",
      text: name,
    })),
  ];
}

function createCheckpointComponents(): A2uiComponentPayload[] {
  return ROUND1_A2UI_CHECKPOINTS.flatMap((checkpoint) => {
    const idPrefix = `checkpoint-${checkpoint.key}`;

    return [
      {
        id: `${idPrefix}-card`,
        component: "Card",
        child: `${idPrefix}-content`,
      },
      {
        id: `${idPrefix}-content`,
        component: "Row",
        children: [`${idPrefix}-identity`, `${idPrefix}-status`],
        justify: "spaceBetween",
        align: "center",
      },
      {
        id: `${idPrefix}-identity`,
        component: "Row",
        children: [`${idPrefix}-icon`, `${idPrefix}-label`],
        align: "center",
      },
      {
        id: `${idPrefix}-icon`,
        component: "Icon",
        name: checkpoint.icon,
      },
      {
        id: `${idPrefix}-label`,
        component: "Text",
        text: checkpoint.label,
      },
      {
        id: `${idPrefix}-status`,
        component: "Text",
        variant: "caption",
        text: checkpoint.status,
      },
    ];
  });
}

function createRound1A2uiComponents(): A2uiComponentPayload[] {
  return [
    {
      id: "root",
      component: "Card",
      child: "layout",
    },
    {
      id: "layout",
      component: "Column",
      children: [
        "heading",
        "summary",
        "section-divider",
        "design-tabs",
        "checkpoint-list",
        "notes",
      ],
    },
    {
      id: "heading",
      component: "Text",
      variant: "h3",
      text: ROUND1_A2UI_COPY.heading,
    },
    {
      id: "summary",
      component: "Text",
      text: ROUND1_A2UI_COPY.summary,
    },
    {
      id: "section-divider",
      component: "Divider",
      axis: "horizontal",
    },
    {
      id: "design-tabs",
      component: "Tabs",
      tabs: [
        { title: "输入", child: "form-grid" },
        { title: "控件", child: "control-row" },
        { title: "目录", child: "catalog-list" },
      ],
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
      variant: "longText",
      value: bindDraftField("note"),
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
      value: bindDraftField("dueAt"),
      enableDate: true,
      enableTime: true,
    },
    {
      id: "enabled",
      component: "CheckBox",
      label: "启用 agent surface 验收",
      value: bindDraftField("enabled"),
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
      min: 40,
      max: 100,
      value: bindDraftField("density"),
    },
    {
      id: "status",
      component: "ChoicePicker",
      label: "验收重点",
      variant: "multipleSelection",
      displayStyle: "chips",
      options: ROUND1_A2UI_FOCUS_OPTIONS,
      value: bindDraftField("checks"),
    },
    {
      id: "apply",
      component: "Button",
      variant: "primary",
      child: "apply-label",
      action: {
        event: {
          name: ROUND1_A2UI_ACTION_NAME,
          context: {
            page: bindDraftField("page"),
            density: bindDraftField("density"),
            checks: bindDraftField("checks"),
            dueAt: bindDraftField("dueAt"),
            enabled: bindDraftField("enabled"),
            note: bindDraftField("note"),
            target: bindDraftField("target"),
          },
        },
      },
    },
    {
      id: "apply-label",
      component: "Text",
      text: ROUND1_A2UI_COPY.actionLabel,
    },
    {
      id: "checkpoint-list",
      component: "List",
      children: ROUND1_A2UI_CHECKPOINTS.map((checkpoint) => `checkpoint-${checkpoint.key}-card`),
      direction: "vertical",
    },
    ...createCheckpointComponents(),
    ...createCatalogSummaryComponents(),
    {
      id: "notes",
      component: "Text",
      variant: "caption",
      text: ROUND1_A2UI_COPY.notes,
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMessageSurfaceId(message: A2uiMessage): string | undefined {
  if ("createSurface" in message) {
    return message.createSurface.surfaceId;
  }
  if ("updateDataModel" in message) {
    return message.updateDataModel.surfaceId;
  }
  if ("updateComponents" in message) {
    return message.updateComponents.surfaceId;
  }
  if ("deleteSurface" in message) {
    return message.deleteSurface.surfaceId;
  }
  return undefined;
}

function getComponentReferences(component: A2uiComponentPayload): string[] {
  const references: string[] = [];
  const child = component["child"];
  const children = component["children"];
  const trigger = component["trigger"];
  const content = component["content"];
  const tabs = component["tabs"];

  if (typeof child === "string") {
    references.push(child);
  }
  if (Array.isArray(children)) {
    references.push(...children.filter((item): item is string => typeof item === "string"));
  }
  if (typeof trigger === "string") {
    references.push(trigger);
  }
  if (typeof content === "string") {
    references.push(content);
  }
  if (Array.isArray(tabs)) {
    for (const tab of tabs) {
      if (isRecord(tab) && typeof tab["child"] === "string") {
        references.push(tab["child"]);
      }
    }
  }

  return references;
}

function getComponentActionName(component: A2uiComponentPayload): string | undefined {
  const action = component["action"];
  if (!isRecord(action)) {
    return undefined;
  }

  const event = action["event"];
  if (!isRecord(event)) {
    return undefined;
  }

  return typeof event["name"] === "string" ? event["name"] : undefined;
}

export function getRound1A2uiBasicCatalogComponents(): string[] {
  return [...basicCatalog.components.keys()].sort((left, right) => left.localeCompare(right));
}

export function assertRound1A2uiMessages(messages: readonly A2uiMessage[]): void {
  if (messages.length > ROUND1_A2UI_LIMITS.maxMessages) {
    throw new Error(`A2UI payload has too many messages: ${messages.length}`);
  }

  const allComponentIds = new Set<string>();
  const allReferences = new Set<string>();

  for (const message of messages) {
    if (message.version !== A2UI_VERSION) {
      throw new Error(`Unsupported A2UI message version: ${message.version}`);
    }

    const surfaceId = getMessageSurfaceId(message);
    if (surfaceId !== ROUND1_A2UI_SURFACE_ID) {
      throw new Error(`Unexpected A2UI surface id: ${surfaceId ?? "missing"}`);
    }

    if ("createSurface" in message && message.createSurface.catalogId !== basicCatalog.id) {
      throw new Error(`Unexpected A2UI catalog id: ${message.createSurface.catalogId}`);
    }

    if ("updateDataModel" in message) {
      const modelPath = message.updateDataModel.path ?? ROUND1_A2UI_DRAFT_ROOT;
      if (!modelPath.startsWith(ROUND1_A2UI_DRAFT_ROOT)) {
        throw new Error(`A2UI data model update escapes ${ROUND1_A2UI_DRAFT_ROOT}: ${modelPath}`);
      }
    }

    if (!("updateComponents" in message)) {
      continue;
    }

    const components = message.updateComponents.components as A2uiComponentPayload[];
    if (components.length > ROUND1_A2UI_LIMITS.maxComponents) {
      throw new Error(`A2UI payload has too many components: ${components.length}`);
    }

    for (const component of components) {
      if (typeof component.id !== "string" || component.id.length === 0) {
        throw new Error("A2UI component id is required");
      }
      if (allComponentIds.has(component.id)) {
        throw new Error(`Duplicate A2UI component id: ${component.id}`);
      }

      const catalogEntry = basicCatalog.components.get(component.component);
      if (!catalogEntry) {
        throw new Error(`Unsupported A2UI component: ${component.component}`);
      }

      const props = Object.fromEntries(
        Object.entries(component).filter(([key]) => key !== "id" && key !== "component"),
      );
      const validation = catalogEntry.schema.safeParse(props);
      if (!validation.success) {
        const issue = validation.error.issues[0];
        const issuePath = issue?.path.join(".") || "component";
        throw new Error(
          `Invalid A2UI ${component.component} component "${component.id}" at ${issuePath}: ${
            issue?.message ?? "schema validation failed"
          }`,
        );
      }

      const actionName = getComponentActionName(component);
      if (actionName && actionName !== ROUND1_A2UI_ACTION_NAME) {
        throw new Error(`Unsupported A2UI action event: ${actionName}`);
      }

      allComponentIds.add(component.id);
      for (const reference of getComponentReferences(component)) {
        allReferences.add(reference);
      }
    }
  }

  if (!allComponentIds.has("root")) {
    throw new Error('A2UI payload must define a "root" component');
  }

  for (const reference of allReferences) {
    if (!allComponentIds.has(reference)) {
      throw new Error(`A2UI component reference is missing: ${reference}`);
    }
  }
}

export function createRound1A2uiMessages(): A2uiMessage[] {
  const messages: A2uiMessage[] = [
    {
      version: A2UI_VERSION,
      createSurface: {
        surfaceId: ROUND1_A2UI_SURFACE_ID,
        catalogId: basicCatalog.id,
        sendDataModel: true,
      },
    },
    {
      version: A2UI_VERSION,
      updateDataModel: {
        surfaceId: ROUND1_A2UI_SURFACE_ID,
        path: ROUND1_A2UI_DRAFT_ROOT,
        value: ROUND1_A2UI_DRAFT,
      },
    },
    {
      version: A2UI_VERSION,
      updateComponents: {
        surfaceId: ROUND1_A2UI_SURFACE_ID,
        components: createRound1A2uiComponents(),
      },
    },
  ];

  assertRound1A2uiMessages(messages);
  return messages;
}

export const ROUND1_A2UI_MESSAGES = createRound1A2uiMessages();

export function createRound1A2uiProcessor(actionHandler?: (action: A2uiClientAction) => void) {
  return new MessageProcessor([basicCatalog], actionHandler);
}

export function getRound1A2uiCapabilities() {
  return createRound1A2uiProcessor().getClientCapabilities();
}
