import { env } from "../../config/env.js";

export type RuntimeSettingValueType = "number" | "boolean" | "string" | "json";

export interface RuntimeSettingDefinition {
  key: string;
  category: string;
  label: string;
  description: string;
  defaultValue: unknown;
  valueType: RuntimeSettingValueType;
  integer?: boolean;
  min?: number;
  max?: number;
}

export const RUNTIME_SETTING_DEFINITIONS: readonly RuntimeSettingDefinition[] = [
  {
    key: "exam.autosaveIntervalSeconds",
    category: "exam",
    label: "Autosave Interval",
    description: "学生答题页自动保存间隔秒数。",
    defaultValue: env.AUTOSAVE_INTERVAL_SECONDS,
    valueType: "number",
    integer: true,
    min: 1,
    max: 3600,
  },
  {
    key: "exam.autosaveRateLimitSeconds",
    category: "exam",
    label: "Autosave Rate Limit",
    description: "服务端按用户限制 autosave 请求的最小间隔秒数。",
    defaultValue: 30,
    valueType: "number",
    integer: true,
    min: 1,
    max: 3600,
  },
  {
    key: "exam.draftTtlMinutes",
    category: "exam",
    label: "Draft TTL",
    description: "未开始或未提交草稿试卷的保留分钟数。",
    defaultValue: env.EXAM_DRAFT_TTL_MINUTES,
    valueType: "number",
    integer: true,
    min: 1,
    max: 43200,
  },
  {
    key: "paper.selection.recentExcludeAttempts",
    category: "paper",
    label: "Recent Paper Exclude",
    description: "运行时选卷时软排除最近 attempt 对应预制卷的数量。",
    defaultValue: 3,
    valueType: "number",
    integer: true,
    min: 0,
    max: 50,
  },
  {
    key: "import.maxBundleSizeMb",
    category: "import",
    label: "Max Bundle Size",
    description: "Admin 导入中心允许提交的 bundle JSON 大小上限。",
    defaultValue: 8,
    valueType: "number",
    integer: true,
    min: 1,
    max: 100,
  },
];

export function getRuntimeSettingDefinition(key: string) {
  return RUNTIME_SETTING_DEFINITIONS.find((definition) => definition.key === key) ?? null;
}

export function validateRuntimeSettingValue(key: string, value: unknown): string | null {
  const definition = getRuntimeSettingDefinition(key);
  if (!definition) {
    return null;
  }

  if (definition.valueType === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return `${key} 必须是 JSON number`;
    }

    if (definition.integer && !Number.isInteger(value)) {
      return `${key} 必须是整数`;
    }

    if (definition.min !== undefined && value < definition.min) {
      return `${key} 不能小于 ${definition.min}`;
    }

    if (definition.max !== undefined && value > definition.max) {
      return `${key} 不能大于 ${definition.max}`;
    }
  }

  if (definition.valueType === "boolean" && typeof value !== "boolean") {
    return `${key} 必须是 JSON boolean`;
  }

  if (definition.valueType === "string" && typeof value !== "string") {
    return `${key} 必须是 JSON string`;
  }

  return null;
}
