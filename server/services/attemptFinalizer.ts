import { and, eq } from "drizzle-orm";

import { db } from "../db.js";
import {
  assignmentProgress,
  assignments,
  attempts,
  paperQuestionSlots,
  papers,
  questions,
} from "../db/schema/index.js";
import { gradeAttemptAnswers } from "./grader.js";
import { cancelAttemptAutoSubmit, computeAttemptSubmitAt } from "./examAutoSubmitQueue.js";

type FinalizeAttemptParams = {
  attemptId: string;
  userId?: string;
  forceStatus?: "submitted" | "auto_submitted";
  cancelAutoSubmitJob?: boolean;
};

type FinalizeAttemptLoaded = {
  id: string;
  paperId: string;
  userId: string;
  status: string;
  startedAt: Date | null;
  answersJson: unknown;
  submittedAt: Date | string | null;
  score: number | null;
  perSectionJson: unknown;
  perPrimaryKpJson: unknown;
  aiReportJson: unknown;
  reportStatus: string | null;
  autoSubmitJobId: string | null;
};

export type FinalizedAttemptResponse = {
  id: string;
  paperId: string;
  status: string;
  answersJson: Record<string, unknown>;
  submittedAt: Date | string | null;
  score: number | null;
  perSectionJson: Record<string, unknown> | null;
  perPrimaryKpJson: Record<string, unknown> | null;
  reportStatus?: string;
  report?: Record<string, unknown>;
};

export type FinalizeAttemptResult =
  | { kind: "not_found_attempt" }
  | { kind: "not_found_paper" }
  | { kind: "conflict" }
  | { kind: "success"; attempt: FinalizedAttemptResponse };

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function buildAttemptResponse(attempt: FinalizeAttemptLoaded): FinalizedAttemptResponse {
  const response: FinalizedAttemptResponse = {
    id: attempt.id,
    paperId: attempt.paperId,
    status: attempt.status,
    answersJson: normalizeRecord(attempt.answersJson),
    submittedAt: attempt.submittedAt,
    score: attempt.score ?? null,
    perSectionJson: attempt.perSectionJson ? normalizeRecord(attempt.perSectionJson) : null,
    perPrimaryKpJson: attempt.perPrimaryKpJson ? normalizeRecord(attempt.perPrimaryKpJson) : null,
  };

  if (attempt.reportStatus) {
    response.reportStatus = attempt.reportStatus;
  }

  if (
    attempt.aiReportJson &&
    typeof attempt.aiReportJson === "object" &&
    !Array.isArray(attempt.aiReportJson)
  ) {
    response.report = attempt.aiReportJson as Record<string, unknown>;
  }

  return response;
}

export async function finalizeAttempt(
  params: FinalizeAttemptParams,
): Promise<FinalizeAttemptResult> {
  const filters = [eq(attempts.id, params.attemptId)];
  if (params.userId) {
    filters.push(eq(attempts.userId, params.userId));
  }

  const [attempt] = await db
    .select({
      id: attempts.id,
      paperId: attempts.paperId,
      userId: attempts.userId,
      status: attempts.status,
      startedAt: attempts.startedAt,
      answersJson: attempts.answersJson,
      submittedAt: attempts.submittedAt,
      score: attempts.score,
      perSectionJson: attempts.perSectionJson,
      perPrimaryKpJson: attempts.perPrimaryKpJson,
      aiReportJson: attempts.aiReportJson,
      reportStatus: attempts.reportStatus,
      autoSubmitJobId: attempts.autoSubmitJobId,
    })
    .from(attempts)
    .where(and(...filters))
    .limit(1);

  if (!attempt) {
    return { kind: "not_found_attempt" };
  }

  if (attempt.status === "submitted" || attempt.status === "auto_submitted") {
    return { kind: "success", attempt: buildAttemptResponse(attempt) };
  }

  if (attempt.status !== "started") {
    return { kind: "conflict" };
  }

  const [paper] = await db
    .select({
      id: papers.id,
      examType: papers.examType,
      assignmentId: papers.assignmentId,
    })
    .from(papers)
    .where(eq(papers.id, attempt.paperId))
    .limit(1);

  if (!paper) {
    return { kind: "not_found_paper" };
  }

  const [assignment] = paper.assignmentId
    ? await db
        .select({
          dueAt: assignments.dueAt,
        })
        .from(assignments)
        .where(eq(assignments.id, paper.assignmentId))
        .limit(1)
    : [undefined];

  const slots = await db
    .select({
      slotNo: paperQuestionSlots.slotNo,
      questionType: paperQuestionSlots.questionType,
      primaryKpId: paperQuestionSlots.primaryKpId,
      points: paperQuestionSlots.points,
      answerJson: questions.answerJson,
      explanationJson: questions.explanationJson,
    })
    .from(paperQuestionSlots)
    .innerJoin(questions, eq(paperQuestionSlots.currentQuestionId, questions.id))
    .where(eq(paperQuestionSlots.paperId, attempt.paperId))
    .orderBy(paperQuestionSlots.slotNo);

  const grading = gradeAttemptAnswers(normalizeRecord(attempt.answersJson), slots);
  const submitAt = computeAttemptSubmitAt({
    examType: paper.examType,
    startedAt: attempt.startedAt,
    assignmentDueAt: assignment?.dueAt ?? null,
  });
  const finalizedStatus =
    params.forceStatus ?? (Date.now() >= submitAt.getTime() ? "auto_submitted" : "submitted");

  const finalizedAttempt = await db.transaction(async (tx) => {
    const finalizedAt = new Date();
    const [updatedAttempt] = await tx
      .update(attempts)
      .set({
        status: finalizedStatus,
        submittedAt: finalizedAt,
        updatedAt: finalizedAt,
        score: grading.score,
        perSectionJson: grading.perSectionJson,
        perPrimaryKpJson: grading.perPrimaryKpJson,
        aiReportJson: grading.report,
        reportStatus: grading.reportStatus,
        reportError: null,
      })
      .where(and(eq(attempts.id, params.attemptId), eq(attempts.status, "started")))
      .returning({
        id: attempts.id,
        paperId: attempts.paperId,
        userId: attempts.userId,
        status: attempts.status,
        startedAt: attempts.startedAt,
        answersJson: attempts.answersJson,
        submittedAt: attempts.submittedAt,
        score: attempts.score,
        perSectionJson: attempts.perSectionJson,
        perPrimaryKpJson: attempts.perPrimaryKpJson,
        aiReportJson: attempts.aiReportJson,
        reportStatus: attempts.reportStatus,
        autoSubmitJobId: attempts.autoSubmitJobId,
      });

    if (!updatedAttempt) {
      const [existingFinalizedAttempt] = await tx
        .select({
          id: attempts.id,
          paperId: attempts.paperId,
          userId: attempts.userId,
          status: attempts.status,
          startedAt: attempts.startedAt,
          answersJson: attempts.answersJson,
          submittedAt: attempts.submittedAt,
          score: attempts.score,
          perSectionJson: attempts.perSectionJson,
          perPrimaryKpJson: attempts.perPrimaryKpJson,
          aiReportJson: attempts.aiReportJson,
          reportStatus: attempts.reportStatus,
          autoSubmitJobId: attempts.autoSubmitJobId,
        })
        .from(attempts)
        .where(eq(attempts.id, params.attemptId))
        .limit(1);

      if (existingFinalizedAttempt && existingFinalizedAttempt.status !== "started") {
        return existingFinalizedAttempt;
      }

      throw new Error("Failed to finalize attempt");
    }

    await tx
      .update(papers)
      .set({
        status: "completed",
        updatedAt: finalizedAt,
      })
      .where(eq(papers.id, updatedAttempt.paperId));

    if (paper.assignmentId) {
      await tx
        .update(assignmentProgress)
        .set({
          paperId: updatedAttempt.paperId,
          attemptId: updatedAttempt.id,
          status: "completed",
          updatedAt: finalizedAt,
        })
        .where(
          and(
            eq(assignmentProgress.assignmentId, paper.assignmentId),
            eq(assignmentProgress.userId, attempt.userId),
          ),
        );
    }

    return updatedAttempt;
  });

  if (params.cancelAutoSubmitJob !== false) {
    await cancelAttemptAutoSubmit(attempt.autoSubmitJobId);
  }

  return { kind: "success", attempt: buildAttemptResponse(finalizedAttempt) };
}
