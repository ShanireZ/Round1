import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ExamRuntimeClientError,
  autosaveExamAttempt,
  clearCachedCsrfTokenForTests,
  createExamDraft,
  createRealPaperDraft,
  fetchActiveAttempt,
  fetchActiveDraftExam,
  fetchExamCatalog,
  fetchRealPaperCatalog,
  fetchExamSession,
  sendKeepaliveAutosave,
  startExamAttempt,
  submitExamAttempt,
} from "./exam-runtime";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  fetchMock.mockReset();
  clearCachedCsrfTokenForTests();
});

describe("exam runtime client", () => {
  it("fetches the active exam session payload", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          paper: {
            id: "paper-1",
            examType: "CSP-J",
            difficulty: "easy",
            status: "active",
            assignmentId: null,
          },
          attempt: {
            id: "attempt-1",
            paperId: "paper-1",
            status: "started",
            tabNonce: "nonce-1",
            answersJson: {},
          },
          items: [
            {
              slotNo: 1,
              questionType: "single_choice",
              primaryKpId: 101,
              points: 2,
              contentJson: {
                stem: "中国的国家顶级域名是（）",
                options: ["A. .cn", "B. .ch", "C. .chn", "D. .china"],
              },
            },
          ],
        },
      }),
    });

    const result = await fetchExamSession("paper-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/exams/paper-1/session", {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    expect(result.attempt.id).toBe("attempt-1");
    expect(result.items).toHaveLength(1);
  });

  it("starts an attempt from the runtime endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { csrfToken: "csrf-1" },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: "attempt-1",
          paperId: "paper-1",
          status: "started",
          tabNonce: "nonce-1",
        },
      }),
    });

    const result = await startExamAttempt("paper-1");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/auth/csrf-token", {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/exams/paper-1/attempts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": "csrf-1" },
      body: JSON.stringify({}),
    });
    expect(result.status).toBe("started");
  });

  it("fetches the published prebuilt paper catalog", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          items: [{ examType: "CSP-J", difficulty: "medium", count: 2 }],
        },
      }),
    });

    const result = await fetchExamCatalog();

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/exams/catalog", {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    expect(result.items[0]?.count).toBe(2);
  });

  it("fetches the published real paper catalog", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          items: [
            {
              id: "real-pp-1",
              title: "CSP-J 2026 真题",
              examType: "CSP-J",
              difficulty: "medium",
              year: "2026",
              sourceLabel: "official",
              sourceUrl: null,
              tags: ["真题", "2026"],
              questionCount: 32,
              publishedAt: "2026-05-02T00:00:00.000Z",
            },
          ],
        },
      }),
    });

    const result = await fetchRealPaperCatalog();

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/exams/real-papers/catalog", {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    expect(result.items[0]?.year).toBe("2026");
  });

  it("fetches an active draft before creating a new one", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: "paper-draft",
          prebuiltPaperId: "pp-1",
          examType: "CSP-J",
          difficulty: "medium",
          status: "draft",
        },
      }),
    });

    const result = await fetchActiveDraftExam();

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/exams/active-draft", {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    expect(result?.id).toBe("paper-draft");
  });

  it("creates a draft exam using the CSRF-protected runtime endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { csrfToken: "csrf-1" },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: "paper-1",
          prebuiltPaperId: "pp-1",
          examType: "CSP-J",
          difficulty: "medium",
          status: "draft",
        },
      }),
    });

    const result = await createExamDraft({ examType: "CSP-J", difficulty: "medium" });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/exams", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": "csrf-1" },
      body: JSON.stringify({ examType: "CSP-J", difficulty: "medium" }),
    });
    expect(result.id).toBe("paper-1");
  });

  it("creates a draft from a real paper using the CSRF-protected endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { csrfToken: "csrf-1" },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: "paper-real-1",
          prebuiltPaperId: "real-pp-1",
          examType: "CSP-J",
          difficulty: "medium",
          status: "draft",
        },
      }),
    });

    const result = await createRealPaperDraft("real-pp-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/exams/real-papers/real-pp-1/drafts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": "csrf-1" },
      body: JSON.stringify({}),
    });
    expect(result.prebuiltPaperId).toBe("real-pp-1");
  });

  it("autosaves attempt answers with the current tab nonce", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { csrfToken: "csrf-1" },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: "attempt-1",
          paperId: "paper-1",
          status: "started",
          tabNonce: "nonce-1",
          answersJson: {
            "1": {
              subAnswers: { "0": "B" },
              updatedAt: "2026-04-26T00:30:00.000Z",
            },
          },
        },
      }),
    });

    const answersJson = {
      "1": {
        subAnswers: { "0": "B" },
        updatedAt: "2026-04-26T00:30:00.000Z",
      },
    };

    const result = await autosaveExamAttempt({
      attemptId: "attempt-1",
      tabNonce: "nonce-1",
      patches: [
        {
          slotNo: 1,
          subKey: "0",
          value: "B",
          updatedAt: "2026-04-26T00:30:00.000Z",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/attempts/attempt-1", {
      method: "PATCH",
      credentials: "include",
      keepalive: false,
      headers: {
        "Content-Type": "application/json",
        "X-Tab-Nonce": "nonce-1",
        "X-CSRF-Token": "csrf-1",
      },
      body: JSON.stringify({
        patches: [
          {
            slotNo: 1,
            subKey: "0",
            value: "B",
            updatedAt: "2026-04-26T00:30:00.000Z",
          },
        ],
      }),
    });
    expect(result.answersJson).toEqual(answersJson);
  });

  it("submits an attempt through the runtime endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { csrfToken: "csrf-1" },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: "attempt-1",
          paperId: "paper-1",
          status: "submitted",
          submittedAt: "2026-04-26T00:30:00.000Z",
          score: 88,
          perSectionJson: null,
          perPrimaryKpJson: null,
          reportStatus: "completed",
          report: { wrongs: [] },
        },
      }),
    });

    const result = await submitExamAttempt("attempt-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/attempts/attempt-1/submit", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": "csrf-1" },
      body: JSON.stringify({}),
    });
    expect(result.paperId).toBe("paper-1");
    expect(result.status).toBe("submitted");
  });

  it("submits pending patches with tab nonce on final submit", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { csrfToken: "csrf-1" },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: "attempt-1",
          paperId: "paper-1",
          status: "submitted",
          submittedAt: "2026-04-26T00:30:00.000Z",
          score: 88,
          perSectionJson: null,
          perPrimaryKpJson: null,
        },
      }),
    });

    await submitExamAttempt("attempt-1", {
      tabNonce: "nonce-1",
      patches: [{ slotNo: 1, subKey: "0", value: "B" }],
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/attempts/attempt-1/submit", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "csrf-1",
        "X-Tab-Nonce": "nonce-1",
      },
      body: JSON.stringify({
        patches: [{ slotNo: 1, subKey: "0", value: "B" }],
      }),
    });
  });

  it("surfaces runtime api failures from the attempt lifecycle endpoints", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { csrfToken: "csrf-1" },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: {
          code: "ROUND1_CONFLICT",
          message: "仅允许从 draft 试卷开始答题",
        },
      }),
    });

    await expect(startExamAttempt("paper-locked")).rejects.toBeInstanceOf(ExamRuntimeClientError);
  });

  it("fetches the current active attempt with resume metadata", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: "attempt-1",
          paperId: "paper-1",
          status: "started",
          tabNonce: "nonce-1",
          startedAt: "2026-04-26T00:00:00.000Z",
          submitAt: "2026-04-26T02:00:00.000Z",
          remainingMs: 90 * 60 * 1000,
          examType: "CSP-J",
          difficulty: "easy",
          assignmentId: null,
          resumePath: "/exams/paper-1",
        },
      }),
    });

    const result = await fetchActiveAttempt();

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/attempts/active", {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    expect(result?.remainingMs).toBe(90 * 60 * 1000);
    expect(result?.resumePath).toBe("/exams/paper-1");
  });

  it("sends beforeunload keepalive autosave with nonce and csrf headers", () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    });

    const sent = sendKeepaliveAutosave({
      attemptId: "attempt-1",
      tabNonce: "nonce-1",
      csrfToken: "csrf-1",
      patches: [{ slotNo: 1, subKey: "0", value: "B" }],
    });

    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/attempts/attempt-1", {
      method: "PATCH",
      credentials: "include",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        "X-Tab-Nonce": "nonce-1",
        "X-CSRF-Token": "csrf-1",
      },
      body: JSON.stringify({
        patches: [{ slotNo: 1, subKey: "0", value: "B" }],
      }),
    });
  });
});
