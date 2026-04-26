import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AdminImportClientError,
  fetchImportBatches,
  formatBatchErrorsForClipboard,
  getBatchDetailRows,
  getDefaultExpandedBatchId,
  getBatchErrorDetails,
  getImportEndpoint,
  parseBundleInput,
  submitImportBundle,
} from "./admin-imports";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

describe("admin imports client", () => {
  it("builds raw bundle endpoints for dry-run and apply", () => {
    expect(getImportEndpoint("question_bundle", "dry-run")).toBe(
      "/api/v1/admin/import-batches/questions/dry-run",
    );
    expect(getImportEndpoint("prebuilt_paper_bundle", "apply")).toBe(
      "/api/v1/admin/import-batches/prebuilt-papers/apply",
    );
  });

  it("parses raw bundle text and rejects mismatched bundle types", () => {
    const parsed = parseBundleInput(
      JSON.stringify({ meta: { bundleType: "question_bundle" }, items: [] }),
      "question_bundle",
    );

    expect(parsed).toMatchObject({ meta: { bundleType: "question_bundle" } });
    expect(() =>
      parseBundleInput(
        JSON.stringify({ meta: { bundleType: "prebuilt_paper_bundle" }, items: [] }),
        "question_bundle",
      ),
    ).toThrow("bundleType");
  });

  it("posts raw bundle JSON to the admin import endpoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: "batch-1",
          status: "dry_run",
          sourceFilename: "admin-question-bundle.json",
          checksum: "checksum-1",
          summary: {
            totalCount: 1,
            importedCount: 1,
            rejectedCount: 0,
            errors: [],
          },
        },
      }),
    });

    const bundle = { meta: { bundleType: "question_bundle" }, items: [] };
    const result = await submitImportBundle("question_bundle", "dry-run", bundle);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/import-batches/questions/dry-run",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
      }),
    );
    expect(result.status).toBe("dry_run");
  });

  it("surfaces api errors when import submission fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: {
          code: "ROUND1_VALIDATION_ERROR",
          message: "请求参数校验失败",
        },
      }),
    });

    await expect(
      submitImportBundle("question_bundle", "apply", {
        meta: { bundleType: "question_bundle" },
        items: [],
      }),
    ).rejects.toBeInstanceOf(AdminImportClientError);
  });

  it("reads import batch lists from the admin endpoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          items: [
            {
              id: "batch-1",
              bundleType: "question_bundle",
              status: "dry_run",
              sourceFilename: "admin-question-bundle.json",
              checksum: "checksum-1",
              summaryJson: {
                totalCount: 1,
                importedCount: 1,
                rejectedCount: 0,
                errors: [],
              },
              createdAt: "2026-04-26T00:00:00.000Z",
            },
          ],
          pagination: {
            page: 1,
            pageSize: 10,
            total: 1,
            totalPages: 1,
          },
        },
      }),
    });

    const result = await fetchImportBatches({ page: 1, pageSize: 10 });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/import-batches?page=1&pageSize=10",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.bundleType).toBe("question_bundle");
  });

  it("includes bundleType and status filters in the import batch query", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          items: [],
          pagination: {
            page: 1,
            pageSize: 10,
            total: 0,
            totalPages: 0,
          },
        },
      }),
    });

    await fetchImportBatches({
      page: 2,
      pageSize: 5,
      bundleType: "question_bundle",
      status: "failed",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/import-batches?page=2&pageSize=5&bundleType=question_bundle&status=failed",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("derives batch details and normalized errors for expandable views", () => {
    const batch = {
      id: "batch-1",
      bundleType: "question_bundle" as const,
      status: "partial_failed" as const,
      sourceFilename: "admin-question-bundle.json",
      checksum: "checksum-1",
      importedBy: null,
      createdAt: "2026-04-26T08:00:00.000Z",
      updatedAt: "2026-04-26T08:30:00.000Z",
      summaryJson: {
        totalCount: 3,
        importedCount: 2,
        rejectedCount: 1,
        errors: [
          {
            code: "ROUND1_DUPLICATE",
            message: "题目重复",
            itemIndex: 2,
          },
        ],
      },
    };

    expect(getBatchDetailRows(batch)).toEqual([
      { label: "批次 ID", value: "batch-1" },
      { label: "源文件", value: "admin-question-bundle.json" },
      { label: "Checksum", value: "checksum-1" },
      { label: "导入人", value: "-" },
      { label: "创建时间", value: "2026-04-26T08:00:00.000Z" },
      { label: "更新时间", value: "2026-04-26T08:30:00.000Z" },
    ]);
    expect(getBatchErrorDetails(batch)).toEqual([
      {
        key: "ROUND1_DUPLICATE:2:0",
        code: "ROUND1_DUPLICATE",
        message: "题目重复",
        itemIndex: 2,
      },
    ]);
  });

  it("defaults expansion to the newest failed batch", () => {
    expect(
      getDefaultExpandedBatchId([
        {
          id: "batch-1",
          bundleType: "question_bundle",
          status: "dry_run",
          sourceFilename: "a.json",
          checksum: "checksum-a",
          createdAt: "2026-04-26T08:00:00.000Z",
        },
        {
          id: "batch-2",
          bundleType: "prebuilt_paper_bundle",
          status: "failed",
          sourceFilename: "b.json",
          checksum: "checksum-b",
          createdAt: "2026-04-26T08:20:00.000Z",
        },
        {
          id: "batch-3",
          bundleType: "question_bundle",
          status: "partial_failed",
          sourceFilename: "c.json",
          checksum: "checksum-c",
          createdAt: "2026-04-26T08:40:00.000Z",
        },
      ]),
    ).toBe("batch-3");
    expect(getDefaultExpandedBatchId([])).toBeNull();
  });

  it("formats batch error details for clipboard copy", () => {
    const text = formatBatchErrorsForClipboard({
      id: "batch-2",
      bundleType: "prebuilt_paper_bundle",
      sourceFilename: "b.json",
      summaryJson: {
        totalCount: 2,
        importedCount: 0,
        rejectedCount: 2,
        errors: [
          {
            code: "ROUND1_SCHEMA_ERROR",
            message: "slot points 缺失",
            itemIndex: 1,
          },
        ],
      },
    });

    expect(text).toContain("批次 batch-2");
    expect(text).toContain("prebuilt_paper_bundle");
    expect(text).toContain("ROUND1_SCHEMA_ERROR");
    expect(text).toContain("item #1");
    expect(text).toContain("slot points 缺失");
  });
});
