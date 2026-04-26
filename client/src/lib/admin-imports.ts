export type AdminImportBundleType = "question_bundle" | "prebuilt_paper_bundle";
export type AdminImportAction = "dry-run" | "apply";
export type AdminImportBatchType = AdminImportBundleType | "manual_question_import";
export type AdminImportBatchStatus =
  | "dry_run"
  | "processing"
  | "applied"
  | "partial_failed"
  | "failed";

export interface AdminImportErrorItem {
  code: string;
  message: string;
  itemIndex?: number;
}

export interface AdminImportSummary {
  totalCount: number;
  importedCount: number;
  rejectedCount: number;
  errors: AdminImportErrorItem[];
}

export interface AdminImportBatch {
  id: string;
  bundleType: AdminImportBatchType;
  status: AdminImportBatchStatus;
  sourceFilename: string;
  checksum: string;
  importedBy?: string | null;
  summaryJson?: AdminImportSummary;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminImportBatchDetailRow {
  label: string;
  value: string;
}

export interface AdminImportBatchErrorDetail extends AdminImportErrorItem {
  key: string;
}

export interface AdminImportSubmissionResult {
  id?: string;
  status: AdminImportBatchStatus;
  sourceFilename: string;
  checksum: string;
  summary: AdminImportSummary;
  persisted?: boolean;
  duplicateChecksSkipped?: boolean;
  dbChecksSkipped?: boolean;
}

export interface AdminImportBatchListResult {
  items: AdminImportBatch[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface FetchImportBatchParams {
  page?: number;
  pageSize?: number;
  bundleType?: AdminImportBatchType;
  status?: AdminImportBatchStatus;
}

interface ApiErrorPayload {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface ApiSuccessPayload<T> {
  success: true;
  data: T;
}

type ApiPayload<T> = ApiErrorPayload | ApiSuccessPayload<T>;

export class AdminImportClientError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AdminImportClientError";
    this.code = code;
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readApiPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiPayload<T>;

  if (!response.ok || payload.success === false) {
    const error = payload.success === false ? payload.error : undefined;
    throw new AdminImportClientError(
      error?.code ?? "ROUND1_REQUEST_FAILED",
      error?.message ?? `请求失败 (${response.status})`,
      error?.details,
    );
  }

  return payload.data;
}

export function getImportEndpoint(
  bundleType: AdminImportBundleType,
  action: AdminImportAction,
): string {
  const bundlePath = bundleType === "question_bundle" ? "questions" : "prebuilt-papers";
  return `/api/v1/admin/import-batches/${bundlePath}/${action}`;
}

export function parseBundleInput(
  rawInput: string,
  expectedBundleType: AdminImportBundleType,
): Record<string, unknown> {
  if (rawInput.trim().length === 0) {
    throw new Error("请先粘贴完整的 bundle JSON");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawInput);
  } catch {
    throw new Error("bundle JSON 解析失败，请检查逗号、引号和括号是否完整");
  }

  if (!isRecord(parsed)) {
    throw new Error("bundle JSON 顶层必须是对象");
  }

  const meta = parsed.meta;
  if (!isRecord(meta) || meta.bundleType !== expectedBundleType) {
    throw new Error(`bundleType 必须是 ${expectedBundleType}`);
  }

  return parsed;
}

export async function submitImportBundle(
  bundleType: AdminImportBundleType,
  action: AdminImportAction,
  bundle: Record<string, unknown>,
): Promise<AdminImportSubmissionResult> {
  const response = await fetch(getImportEndpoint(bundleType, action), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bundle),
  });

  return readApiPayload<AdminImportSubmissionResult>(response);
}

export async function fetchImportBatches(
  params: FetchImportBatchParams = {},
): Promise<AdminImportBatchListResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(params.page ?? 1));
  searchParams.set("pageSize", String(params.pageSize ?? 10));

  if (params.bundleType) {
    searchParams.set("bundleType", params.bundleType);
  }

  if (params.status) {
    searchParams.set("status", params.status);
  }

  const response = await fetch(`/api/v1/admin/import-batches?${searchParams.toString()}`, {
    credentials: "include",
  });

  return readApiPayload<AdminImportBatchListResult>(response);
}

export function getBatchDetailRows(batch: AdminImportBatch): AdminImportBatchDetailRow[] {
  return [
    { label: "批次 ID", value: batch.id },
    { label: "源文件", value: batch.sourceFilename },
    { label: "Checksum", value: batch.checksum },
    { label: "导入人", value: batch.importedBy ?? "-" },
    { label: "创建时间", value: batch.createdAt ?? "-" },
    { label: "更新时间", value: batch.updatedAt ?? "-" },
  ];
}

export function getBatchErrorDetails(
  batch: Pick<AdminImportBatch, "summaryJson">,
): AdminImportBatchErrorDetail[] {
  const errors = batch.summaryJson?.errors ?? [];

  return errors.map((error, index) => ({
    ...error,
    key: `${error.code}:${error.itemIndex ?? "na"}:${index}`,
  }));
}

export function getDefaultExpandedBatchId(batches: AdminImportBatch[]): string | null {
  for (let index = batches.length - 1; index >= 0; index -= 1) {
    const batch = batches[index];
    if (batch && (batch.status === "failed" || batch.status === "partial_failed")) {
      return batch.id;
    }
  }

  return null;
}

export function formatBatchErrorsForClipboard(
  batch: Pick<AdminImportBatch, "id" | "bundleType" | "sourceFilename" | "summaryJson">,
): string {
  const errors = getBatchErrorDetails(batch);
  const lines = [
    `批次 ${batch.id}`,
    `bundleType: ${batch.bundleType}`,
    `source: ${batch.sourceFilename}`,
  ];

  if (errors.length === 0) {
    lines.push("无 error items");
    return lines.join("\n");
  }

  for (const error of errors) {
    const itemLabel = typeof error.itemIndex === "number" ? ` item #${error.itemIndex}` : "";
    lines.push(`- [${error.code}]${itemLabel} ${error.message}`);
  }

  return lines.join("\n");
}
