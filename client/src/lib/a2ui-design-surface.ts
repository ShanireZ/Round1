import {
  MessageProcessor,
  type A2uiClientAction,
  type A2uiMessage,
  type Catalog,
} from "@a2ui/web_core/v0_9";
import { basicCatalog, type ReactComponentImplementation } from "@a2ui/react/v0_9";

const A2UI_VERSION = "v0.9";
const ROUND1_A2UI_DRAFT_ROOT = "/draft";
const ROUND1_A2UI_ACTION_NAME = "round1_a2ui_review";
const ROUND1_A2UI_LIMITS = {
  maxMessages: 4,
  maxComponents: 120,
  maxDataUrlLength: 50_000,
} as const;

export const ROUND1_A2UI_SURFACE_ID = "round1-design-assistant";

export type Round1A2uiRole = "student" | "coach" | "admin";
export type Round1A2uiProductionSlotId =
  | "assistant-panel"
  | "dashboard-insight"
  | "coach-report-insight"
  | "admin-ops-insight"
  | "exam-result-explanation";

export type Round1A2uiProductionSlotPolicy = {
  id: Round1A2uiProductionSlotId;
  label: string;
  roles: readonly Round1A2uiRole[];
  dataRoots: readonly string[];
  actions: readonly string[];
  auditEvent: string;
};

export const ROUND1_A2UI_PRODUCTION_SLOT_POLICIES: Record<
  Round1A2uiProductionSlotId,
  Round1A2uiProductionSlotPolicy
> = {
  "assistant-panel": {
    id: "assistant-panel",
    label: "全局助手面板",
    roles: ["student", "coach", "admin"],
    dataRoots: ["/assistant", "/draft"],
    actions: [ROUND1_A2UI_ACTION_NAME],
    auditEvent: "a2ui.assistant_panel.action",
  },
  "dashboard-insight": {
    id: "dashboard-insight",
    label: "Dashboard 学习建议",
    roles: ["student", "coach", "admin"],
    dataRoots: ["/dashboard", "/draft"],
    actions: [ROUND1_A2UI_ACTION_NAME],
    auditEvent: "a2ui.dashboard_insight.action",
  },
  "coach-report-insight": {
    id: "coach-report-insight",
    label: "CoachReport 报告片段",
    roles: ["coach", "admin"],
    dataRoots: ["/coach", "/draft"],
    actions: [ROUND1_A2UI_ACTION_NAME],
    auditEvent: "a2ui.coach_report_insight.action",
  },
  "admin-ops-insight": {
    id: "admin-ops-insight",
    label: "Admin 运维洞察",
    roles: ["admin"],
    dataRoots: ["/admin", "/draft"],
    actions: [ROUND1_A2UI_ACTION_NAME],
    auditEvent: "a2ui.admin_ops_insight.action",
  },
  "exam-result-explanation": {
    id: "exam-result-explanation",
    label: "ExamResult 讲解片段",
    roles: ["student", "coach", "admin"],
    dataRoots: ["/result", "/draft"],
    actions: [ROUND1_A2UI_ACTION_NAME],
    auditEvent: "a2ui.exam_result_explanation.action",
  },
};

const ROUND1_A2UI_MEDIA = {
  imageUrl: "/favicon.svg",
  audioUrl: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=",
  videoUrl: "data:video/mp4;base64,",
} as const;

const ROUND1_A2UI_DRAFT = {
  page: "CoachReport",
  density: 72,
  dueAt: "2026-04-28T18:00:00",
  enabled: true,
  students: 128,
  averageScore: 86,
  completionRate: 0.74,
  printReady: true,
  classCount: 6,
  activeClasses: 5,
  openAssignments: 4,
  detailMembers: 32,
  detailCoaches: 3,
  activeInvites: 2,
  ownerReady: true,
  joinedClasses: 2,
  completedAssignments: 9,
  inviteReady: true,
  emailVerified: true,
  passwordEnabled: true,
  totpEnabled: false,
  passkeys: 1,
  externalBindings: 1,
  authPages: 5,
  authCallbackReady: true,
  notFoundReady: true,
  authCompletionRate: 1,
  adminDraftQuestions: 14,
  adminReviewedQuestions: 8,
  adminPublishedQuestions: 46,
  adminArchivedQuestions: 3,
  adminReferenceChecks: 7,
  adminSandboxCoverage: 0.82,
  adminDraftPapers: 5,
  adminPublishedPapers: 18,
  adminArchivedPapers: 4,
  adminSlotCount: 280,
  adminCopyVersionReady: true,
  adminImmutableReady: true,
  adminDryRuns: 12,
  adminAppliedImports: 9,
  adminFailedImports: 2,
  adminRejectedItems: 6,
  adminSharedSummaryReady: true,
  adminRepairReady: true,
  dashboardAttempts: 12,
  dashboardRankPercentile: 0.18,
  dashboardWeakKps: 5,
  dashboardTrendReady: true,
  resultScore: 91.5,
  resultAccuracy: 0.88,
  resultExplanations: 8,
  resultCeremonyReady: true,
  adminApiHealthy: true,
  adminDbHealthy: true,
  adminRedisHealthy: false,
  adminImportRisk: 2,
  productionSlotCount: 5,
  productionGuardCount: 7,
  productionFallbackReady: true,
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
    "**A2UI** is the primary agent-facing design surface for generated UI review; production primitives must stay catalog-compatible through the Round1 token bridge.",
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
type Round1A2uiCatalog = Catalog<ReactComponentImplementation>;

type Round1A2uiMessageOptions = {
  catalog?: Round1A2uiCatalog;
  includeRound1Snapshot?: boolean;
};

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

function createMediaComponents(): A2uiComponentPayload[] {
  return [
    {
      id: "media-card",
      component: "Card",
      child: "media-layout",
    },
    {
      id: "media-layout",
      component: "Column",
      children: ["media-image", "media-summary", "media-modal"],
    },
    {
      id: "media-image",
      component: "Image",
      url: ROUND1_A2UI_MEDIA.imageUrl,
      description: "Round1 R1 monogram preview",
      fit: "contain",
      variant: "smallFeature",
      accessibility: {
        label: "Round1 logo preview",
      },
    },
    {
      id: "media-summary",
      component: "Text",
      variant: "caption",
      text: "Image, Modal, AudioPlayer, and Video are included in the guarded basic catalog surface.",
    },
    {
      id: "media-modal",
      component: "Modal",
      trigger: "media-modal-trigger",
      content: "media-modal-content",
    },
    {
      id: "media-modal-trigger",
      component: "Button",
      variant: "borderless",
      child: "media-modal-trigger-label",
      action: {
        event: {
          name: ROUND1_A2UI_ACTION_NAME,
          context: {
            page: bindDraftField("page"),
            target: "media-catalog-preview",
          },
        },
      },
    },
    {
      id: "media-modal-trigger-label",
      component: "Text",
      text: "打开媒体组件预览",
    },
    {
      id: "media-modal-content",
      component: "Column",
      children: ["media-modal-title", "media-video", "media-audio"],
    },
    {
      id: "media-modal-title",
      component: "Text",
      variant: "h4",
      text: "A2UI media components",
    },
    {
      id: "media-video",
      component: "Video",
      url: ROUND1_A2UI_MEDIA.videoUrl,
      accessibility: {
        label: "Video component schema preview",
      },
    },
    {
      id: "media-audio",
      component: "AudioPlayer",
      url: ROUND1_A2UI_MEDIA.audioUrl,
      description: "AudioPlayer component schema preview",
      accessibility: {
        label: "Audio component schema preview",
      },
    },
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

function createRound1A2uiComponents(
  options: { includeRound1Snapshot?: boolean } = {},
): A2uiComponentPayload[] {
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
        ...(options.includeRound1Snapshot
          ? [
              "round1-class-snapshot",
              "round1-class-detail-snapshot",
              "round1-student-class-snapshot",
              "round1-security-snapshot",
              "round1-auth-snapshot",
              "round1-admin-question-snapshot",
              "round1-admin-paper-snapshot",
              "round1-admin-import-snapshot",
              "round1-dashboard-snapshot",
              "round1-admin-health-snapshot",
              "round1-exam-result-snapshot",
              "round1-slot-policy-snapshot",
              "round1-report-snapshot",
            ]
          : []),
        "media-card",
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
    ...(options.includeRound1Snapshot
      ? [
          {
            id: "round1-class-snapshot",
            component: "Round1CoachClassSnapshot",
            title: "CoachClasses",
            classCount: bindDraftField("classCount"),
            activeClasses: bindDraftField("activeClasses"),
            students: bindDraftField("students"),
            openAssignments: bindDraftField("openAssignments"),
            inviteReady: bindDraftField("inviteReady"),
            tone: "stable",
          },
          {
            id: "round1-class-detail-snapshot",
            component: "Round1CoachClassDetailSnapshot",
            title: "CoachClassDetail",
            members: bindDraftField("detailMembers"),
            coaches: bindDraftField("detailCoaches"),
            activeInvites: bindDraftField("activeInvites"),
            ownerReady: bindDraftField("ownerReady"),
            inviteReady: bindDraftField("inviteReady"),
            tone: "improving",
          },
          {
            id: "round1-report-snapshot",
            component: "Round1CoachReportSnapshot",
            title: bindDraftField("page"),
            students: bindDraftField("students"),
            averageScore: bindDraftField("averageScore"),
            completionRate: bindDraftField("completionRate"),
            printReady: bindDraftField("printReady"),
            tone: "improving",
          },
          {
            id: "round1-student-class-snapshot",
            component: "Round1StudentClassSnapshot",
            title: "MyClasses",
            joinedClasses: bindDraftField("joinedClasses"),
            openAssignments: bindDraftField("openAssignments"),
            completedAssignments: bindDraftField("completedAssignments"),
            inviteReady: bindDraftField("inviteReady"),
            tone: "improving",
          },
          {
            id: "round1-security-snapshot",
            component: "Round1AccountSecuritySnapshot",
            title: "AccountSecurity",
            emailVerified: bindDraftField("emailVerified"),
            passwordEnabled: bindDraftField("passwordEnabled"),
            totpEnabled: bindDraftField("totpEnabled"),
            passkeys: bindDraftField("passkeys"),
            externalBindings: bindDraftField("externalBindings"),
            tone: "stable",
          },
          {
            id: "round1-auth-snapshot",
            component: "Round1AuthEntrySnapshot",
            title: "AuthEntrypoints",
            authPages: bindDraftField("authPages"),
            callbackReady: bindDraftField("authCallbackReady"),
            notFoundReady: bindDraftField("notFoundReady"),
            completionRate: bindDraftField("authCompletionRate"),
            tone: "improving",
          },
          {
            id: "round1-admin-question-snapshot",
            component: "Round1AdminQuestionSnapshot",
            title: "AdminQuestionLibrary",
            draftQuestions: bindDraftField("adminDraftQuestions"),
            reviewedQuestions: bindDraftField("adminReviewedQuestions"),
            publishedQuestions: bindDraftField("adminPublishedQuestions"),
            archivedQuestions: bindDraftField("adminArchivedQuestions"),
            referenceChecks: bindDraftField("adminReferenceChecks"),
            sandboxCoverage: bindDraftField("adminSandboxCoverage"),
            tone: "improving",
          },
          {
            id: "round1-admin-paper-snapshot",
            component: "Round1AdminPaperSnapshot",
            title: "AdminPaperLibrary",
            draftPapers: bindDraftField("adminDraftPapers"),
            publishedPapers: bindDraftField("adminPublishedPapers"),
            archivedPapers: bindDraftField("adminArchivedPapers"),
            slotCount: bindDraftField("adminSlotCount"),
            copyVersionReady: bindDraftField("adminCopyVersionReady"),
            immutableReady: bindDraftField("adminImmutableReady"),
            tone: "stable",
          },
          {
            id: "round1-admin-import-snapshot",
            component: "Round1AdminImportSnapshot",
            title: "AdminImports",
            dryRuns: bindDraftField("adminDryRuns"),
            appliedImports: bindDraftField("adminAppliedImports"),
            failedImports: bindDraftField("adminFailedImports"),
            rejectedItems: bindDraftField("adminRejectedItems"),
            sharedSummaryReady: bindDraftField("adminSharedSummaryReady"),
            repairReady: bindDraftField("adminRepairReady"),
            tone: "risk",
          },
          {
            id: "round1-dashboard-snapshot",
            component: "Round1DashboardInsightSnapshot",
            title: "DashboardInsight",
            attempts: bindDraftField("dashboardAttempts"),
            rankPercentile: bindDraftField("dashboardRankPercentile"),
            weakKnowledgePoints: bindDraftField("dashboardWeakKps"),
            trendReady: bindDraftField("dashboardTrendReady"),
            tone: "improving",
          },
          {
            id: "round1-admin-health-snapshot",
            component: "Round1AdminHealthSnapshot",
            title: "AdminOpsInsight",
            apiHealthy: bindDraftField("adminApiHealthy"),
            dbHealthy: bindDraftField("adminDbHealthy"),
            redisHealthy: bindDraftField("adminRedisHealthy"),
            importRisk: bindDraftField("adminImportRisk"),
            tone: "risk",
          },
          {
            id: "round1-exam-result-snapshot",
            component: "Round1ExamResultExplanationSnapshot",
            title: "ExamResultExplanation",
            score: bindDraftField("resultScore"),
            accuracy: bindDraftField("resultAccuracy"),
            explanations: bindDraftField("resultExplanations"),
            ceremonyReady: bindDraftField("resultCeremonyReady"),
            tone: "stable",
          },
          {
            id: "round1-slot-policy-snapshot",
            component: "Round1A2uiSlotPolicySnapshot",
            title: "A2UIProductionSlots",
            slotCount: bindDraftField("productionSlotCount"),
            guardCount: bindDraftField("productionGuardCount"),
            fallbackReady: bindDraftField("productionFallbackReady"),
            tone: "stable",
          },
        ]
      : []),
    {
      id: "checkpoint-list",
      component: "List",
      children: ROUND1_A2UI_CHECKPOINTS.map((checkpoint) => `checkpoint-${checkpoint.key}-card`),
      direction: "vertical",
    },
    ...createCheckpointComponents(),
    ...createCatalogSummaryComponents(),
    ...createMediaComponents(),
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
  } else if (isRecord(children) && typeof children["componentId"] === "string") {
    references.push(children["componentId"]);
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

function getComponentActionEventName(component: A2uiComponentPayload): string | undefined {
  const action = component["action"];
  if (!isRecord(action)) {
    return undefined;
  }

  if (isRecord(action["functionCall"])) {
    throw new Error(`A2UI function actions are not allowed: ${component.id}`);
  }

  const event = action["event"];
  if (!isRecord(event)) {
    throw new Error(`Unsupported A2UI action shape: ${component.id}`);
  }

  return typeof event["name"] === "string" ? event["name"] : undefined;
}

function assertNoFunctionBindings(value: unknown, componentId: string, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoFunctionBindings(item, componentId, `${path}.${index}`);
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (typeof value["call"] === "string" && isRecord(value["args"])) {
    throw new Error(`A2UI function bindings are not allowed: ${componentId}.${path}`);
  }

  for (const [key, child] of Object.entries(value)) {
    assertNoFunctionBindings(child, componentId, path ? `${path}.${key}` : key);
  }
}

function isIconSvgPath(component: A2uiComponentPayload, path: string): boolean {
  return component.component === "Icon" && path === "props.name";
}

function assertDataBindingsStayInDraft(
  value: unknown,
  componentId: string,
  component: A2uiComponentPayload,
  path: string,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertDataBindingsStayInDraft(item, componentId, component, `${path}.${index}`);
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (
    typeof value["path"] === "string" &&
    !isIconSvgPath(component, path) &&
    !isAllowedDataModelPath(value["path"])
  ) {
    throw new Error(
      `A2UI data binding escapes ${ROUND1_A2UI_DRAFT_ROOT}: ${componentId}.${path}.path=${value["path"]}`,
    );
  }

  for (const [key, child] of Object.entries(value)) {
    assertDataBindingsStayInDraft(child, componentId, component, path ? `${path}.${key}` : key);
  }
}

function isAllowedDataModelPath(path: string): boolean {
  return path === ROUND1_A2UI_DRAFT_ROOT || path.startsWith(`${ROUND1_A2UI_DRAFT_ROOT}/`);
}

function isAllowedPathForRoots(path: string, roots: readonly string[]): boolean {
  return roots.some((root) => path === root || path.startsWith(`${root}/`));
}

function isSafeRound1A2uiMediaUrl(url: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) {
    return true;
  }

  if (url.startsWith("data:")) {
    const isAllowedMedia = /^data:(?:image|audio|video)\/[a-z0-9.+-]+;base64,/i.test(url);
    return isAllowedMedia && url.length <= ROUND1_A2UI_LIMITS.maxDataUrlLength;
  }

  return false;
}

function assertSafeMediaUrl(component: A2uiComponentPayload, props: Record<string, unknown>): void {
  if (
    component.component !== "Image" &&
    component.component !== "AudioPlayer" &&
    component.component !== "Video"
  ) {
    return;
  }

  const url = props["url"];
  if (typeof url === "string" && !isSafeRound1A2uiMediaUrl(url)) {
    throw new Error(`A2UI media URL is not allowed: ${component.id}`);
  }
}

export function getRound1A2uiProductionSlotPolicy(slotId: Round1A2uiProductionSlotId) {
  return ROUND1_A2UI_PRODUCTION_SLOT_POLICIES[slotId];
}

export function assertRound1A2uiProductionSlotAccess({
  slotId,
  role,
  actionName,
  dataPath,
  mediaUrl,
}: {
  slotId: Round1A2uiProductionSlotId;
  role: Round1A2uiRole;
  actionName?: string;
  dataPath?: string;
  mediaUrl?: string;
}): void {
  const policy = getRound1A2uiProductionSlotPolicy(slotId);

  if (!policy.roles.includes(role)) {
    throw new Error(`A2UI slot role is not allowed: ${slotId}:${role}`);
  }

  if (actionName && !policy.actions.includes(actionName)) {
    throw new Error(`A2UI slot action is not allowed: ${slotId}:${actionName}`);
  }

  if (dataPath && !isAllowedPathForRoots(dataPath, policy.dataRoots)) {
    throw new Error(`A2UI slot data path is not allowed: ${slotId}:${dataPath}`);
  }

  if (mediaUrl && !isSafeRound1A2uiMediaUrl(mediaUrl)) {
    throw new Error(`A2UI slot media URL is not allowed: ${slotId}`);
  }
}

export function formatRound1A2uiActionSummary(action: A2uiClientAction): string {
  const context = isRecord(action.context) ? action.context : {};
  const density = typeof context["density"] === "number" ? `${context["density"]}%` : "未设置";
  const checks = Array.isArray(context["checks"]) ? context["checks"].length : 0;

  return `${action.name} · ${density} · ${checks}项`;
}

export function getRound1A2uiBasicCatalogComponents(): string[] {
  return [...basicCatalog.components.keys()].sort((left, right) => left.localeCompare(right));
}

export function assertRound1A2uiMessages(
  messages: readonly A2uiMessage[],
  catalog: Round1A2uiCatalog = basicCatalog,
): void {
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

    if ("createSurface" in message && message.createSurface.catalogId !== catalog.id) {
      throw new Error(`Unexpected A2UI catalog id: ${message.createSurface.catalogId}`);
    }

    if ("updateDataModel" in message) {
      const modelPath = message.updateDataModel.path ?? ROUND1_A2UI_DRAFT_ROOT;
      if (!isAllowedDataModelPath(modelPath)) {
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

      const catalogEntry = catalog.components.get(component.component);
      if (!catalogEntry) {
        throw new Error(`Unsupported A2UI component: ${component.component}`);
      }

      const props = Object.fromEntries(
        Object.entries(component).filter(([key]) => key !== "id" && key !== "component"),
      );
      const actionName = getComponentActionEventName(component);
      assertNoFunctionBindings(props, component.id, "props");
      assertDataBindingsStayInDraft(props, component.id, component, "props");
      assertSafeMediaUrl(component, props);
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

export function createRound1A2uiMessages(options: Round1A2uiMessageOptions = {}): A2uiMessage[] {
  const catalog = options.catalog ?? basicCatalog;
  const messages: A2uiMessage[] = [
    {
      version: A2UI_VERSION,
      createSurface: {
        surfaceId: ROUND1_A2UI_SURFACE_ID,
        catalogId: catalog.id,
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
        components: createRound1A2uiComponents({
          includeRound1Snapshot: options.includeRound1Snapshot,
        }),
      },
    },
  ];

  assertRound1A2uiMessages(messages, catalog);
  return messages;
}

export const ROUND1_A2UI_MESSAGES = createRound1A2uiMessages();

export function createRound1A2uiProcessor(
  actionHandler?: (action: A2uiClientAction) => void,
  catalog: Round1A2uiCatalog = basicCatalog,
) {
  return new MessageProcessor([catalog], actionHandler);
}

export function getRound1A2uiCapabilities(catalog: Round1A2uiCatalog = basicCatalog) {
  return createRound1A2uiProcessor(undefined, catalog).getClientCapabilities();
}
