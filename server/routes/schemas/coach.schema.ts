import { z } from "zod";
import { registry } from "../../openapi/registry.js";

const UuidSchema = z.string().uuid();
const ClassCoachRoleSchema = z.enum(["owner", "collaborator"]);
const DifficultySchema = z.enum(["easy", "medium", "hard"]);

export const JoinClassBodySchema = registry.register(
  "JoinClassBody",
  z
    .object({
      code: z.string().trim().min(1).max(20).optional(),
      inviteToken: z.string().trim().min(16).max(256).optional(),
    })
    .strict()
    .refine((value) => Boolean(value.code) !== Boolean(value.inviteToken), {
      message: "必须且只能提供 code 或 inviteToken",
    }),
);

export const CreateClassBodySchema = registry.register(
  "CreateClassBody",
  z
    .object({
      name: z.string().trim().min(1).max(100),
    })
    .strict(),
);

export const UpdateClassBodySchema = registry.register(
  "UpdateClassBody",
  z
    .object({
      name: z.string().trim().min(1).max(100),
    })
    .strict(),
);

export const CreateClassInviteBodySchema = registry.register(
  "CreateClassInviteBody",
  z
    .object({
      expiresAt: z.string().datetime(),
      maxUses: z.coerce.number().int().min(1).max(10_000).default(50),
    })
    .strict(),
);

export const AddClassCoachBodySchema = registry.register(
  "AddClassCoachBody",
  z
    .object({
      userId: UuidSchema,
    })
    .strict(),
);

export const CreateAssignmentBodySchema = registry.register(
  "CreateAssignmentBody",
  z
    .object({
      classId: UuidSchema,
      title: z.string().trim().min(1).max(200),
      prebuiltPaperId: UuidSchema,
      dueAt: z.string().datetime(),
    })
    .strict(),
);

export const UpdateAssignmentBodySchema = registry.register(
  "UpdateAssignmentBody",
  z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      dueAt: z.string().datetime().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "至少提供一个可更新字段",
    }),
);

export const ClassSummarySchema = registry.register(
  "ClassSummary",
  z.object({
    id: UuidSchema,
    name: z.string(),
    joinCode: z.string(),
    archivedAt: z.date().nullable().or(z.string().nullable()),
    createdBy: UuidSchema,
    createdAt: z.date().or(z.string()),
    updatedAt: z.date().or(z.string()),
    coachRole: ClassCoachRoleSchema.optional(),
    memberCount: z.number().optional(),
    coachCount: z.number().optional(),
  }),
);

export const ClassMemberSchema = registry.register(
  "ClassMember",
  z.object({
    classId: UuidSchema,
    userId: UuidSchema,
    username: z.string(),
    displayName: z.string(),
    role: z.string(),
    joinedVia: z.string(),
    joinedAt: z.date().or(z.string()),
  }),
);

export const StudentClassSummarySchema = registry.register(
  "StudentClassSummary",
  z.object({
    classId: UuidSchema,
    name: z.string(),
    archivedAt: z.date().nullable().or(z.string().nullable()),
    joinedVia: z.string(),
    joinedAt: z.date().or(z.string()),
    openAssignments: z.number(),
    completedAssignments: z.number(),
    missedAssignments: z.number(),
  }),
);

export const ClassInviteSchema = registry.register(
  "ClassInvite",
  z.object({
    id: UuidSchema,
    classId: UuidSchema,
    token: z.string().optional(),
    joinUrl: z.string().optional(),
    expiresAt: z.date().or(z.string()),
    maxUses: z.number(),
    useCount: z.number(),
    revokedAt: z.date().nullable().or(z.string().nullable()),
    createdAt: z.date().or(z.string()),
  }),
);

export const ClassCoachSchema = registry.register(
  "ClassCoach",
  z.object({
    classId: UuidSchema,
    userId: UuidSchema,
    username: z.string(),
    displayName: z.string(),
    userRole: z.string(),
    coachRole: ClassCoachRoleSchema,
    addedAt: z.date().or(z.string()),
  }),
);

export const AssignmentSummarySchema = registry.register(
  "AssignmentSummary",
  z.object({
    id: UuidSchema,
    classId: UuidSchema,
    createdBy: UuidSchema,
    title: z.string(),
    mode: z.string(),
    prebuiltPaperId: UuidSchema.nullable(),
    examType: z.string(),
    difficulty: DifficultySchema.optional(),
    blueprintVersion: z.number(),
    dueAt: z.date().nullable().or(z.string().nullable()),
    status: z.string(),
    createdAt: z.date().or(z.string()),
    updatedAt: z.date().or(z.string()),
    assignedStudents: z.number().optional(),
  }),
);

export const CoachPrebuiltPaperSummarySchema = registry.register(
  "CoachPrebuiltPaperSummary",
  z.object({
    id: UuidSchema,
    title: z.string(),
    examType: z.string(),
    difficulty: DifficultySchema,
    blueprintVersion: z.number(),
    publishedAt: z.date().nullable().or(z.string().nullable()),
  }),
);

const KpReportSummarySchema = z.object({
  kpId: z.string(),
  total: z.number(),
  correct: z.number(),
  accuracy: z.number(),
});

const QuestionTypeReportSummarySchema = z.object({
  questionType: z.string(),
  total: z.number(),
  correct: z.number(),
  score: z.number(),
  maxScore: z.number(),
  accuracy: z.number(),
});

export const ClassReportSchema = registry.register(
  "ClassReport",
  z.object({
    classId: UuidSchema,
    totals: z.object({
      students: z.number(),
      pending: z.number(),
      inProgress: z.number(),
      completed: z.number(),
      missed: z.number(),
      averageScore: z.number(),
    }),
    assignments: z.array(
      z.object({
        assignmentId: UuidSchema,
        title: z.string(),
        status: z.string(),
        dueAt: z.date().nullable().or(z.string().nullable()),
        completed: z.number(),
        missed: z.number(),
        averageScore: z.number(),
      }),
    ),
    heatmap: z.object({
      knowledgePointIds: z.array(z.string()),
      students: z.array(
        z.object({
          userId: UuidSchema,
          displayName: z.string(),
          values: z.array(KpReportSummarySchema),
        }),
      ),
    }),
    questionTypeStats: z.array(QuestionTypeReportSummarySchema),
    students: z.array(
      z.object({
        userId: UuidSchema,
        username: z.string(),
        displayName: z.string(),
        pending: z.number(),
        inProgress: z.number(),
        completed: z.number(),
        missed: z.number(),
        averageScore: z.number(),
        latestSubmittedAt: z.date().nullable().or(z.string().nullable()),
        kpStats: z.array(KpReportSummarySchema),
        questionTypeStats: z.array(QuestionTypeReportSummarySchema),
        trend: z.array(
          z.object({
            assignmentId: UuidSchema,
            title: z.string(),
            status: z.string(),
            dueAt: z.date().nullable().or(z.string().nullable()),
            progressStatus: z.string(),
            score: z.number().nullable(),
            submittedAt: z.date().nullable().or(z.string().nullable()),
          }),
        ),
      }),
    ),
  }),
);

function okEnvelope(data: z.ZodTypeAny) {
  return z.object({
    success: z.literal(true),
    data,
  });
}

function listEnvelope(item: z.ZodTypeAny) {
  return okEnvelope(z.object({ items: z.array(item) }));
}

const ErrorResponseRef = { $ref: "#/components/schemas/ErrorResponse" };

function registerJsonPath(params: {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  summary: string;
  request?: z.ZodTypeAny;
  response: z.ZodTypeAny;
}) {
  registry.registerPath({
    method: params.method,
    path: params.path,
    summary: params.summary,
    request: params.request
      ? {
          body: {
            content: {
              "application/json": {
                schema: params.request,
              },
            },
          },
        }
      : undefined,
    responses: {
      200: {
        description: "Success",
        content: {
          "application/json": {
            schema: params.response,
          },
        },
      },
      400: {
        description: "Validation error",
        content: { "application/json": { schema: ErrorResponseRef } },
      },
      401: {
        description: "Unauthenticated",
        content: { "application/json": { schema: ErrorResponseRef } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorResponseRef } },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: ErrorResponseRef } },
      },
      409: {
        description: "Conflict",
        content: { "application/json": { schema: ErrorResponseRef } },
      },
    },
  });
}

registerJsonPath({
  method: "post",
  path: "/api/v1/classes/join",
  summary: "student+ joins a class by join code or invite token",
  request: JoinClassBodySchema,
  response: okEnvelope(ClassMemberSchema),
});

registerJsonPath({
  method: "get",
  path: "/api/v1/classes/mine",
  summary: "student+ lists classes they have joined",
  response: listEnvelope(StudentClassSummarySchema),
});

registerJsonPath({
  method: "get",
  path: "/api/v1/coach/classes",
  summary: "coach+ lists classes they coach",
  response: listEnvelope(ClassSummarySchema),
});

registerJsonPath({
  method: "get",
  path: "/api/v1/coach/prebuilt-papers",
  summary: "coach+ lists published prebuilt papers assignable to classes",
  response: listEnvelope(CoachPrebuiltPaperSummarySchema),
});

registerJsonPath({
  method: "post",
  path: "/api/v1/coach/classes",
  summary: "coach+ creates a class and becomes owner",
  request: CreateClassBodySchema,
  response: okEnvelope(ClassSummarySchema),
});

registerJsonPath({
  method: "get",
  path: "/api/v1/coach/classes/{id}",
  summary: "coach+ reads a class they coach",
  response: okEnvelope(ClassSummarySchema),
});

registerJsonPath({
  method: "patch",
  path: "/api/v1/coach/classes/{id}",
  summary: "owner edits class metadata",
  request: UpdateClassBodySchema,
  response: okEnvelope(ClassSummarySchema),
});

registerJsonPath({
  method: "post",
  path: "/api/v1/coach/classes/{id}/archive",
  summary: "owner archives a class",
  response: okEnvelope(ClassSummarySchema),
});

registerJsonPath({
  method: "post",
  path: "/api/v1/coach/classes/{id}/rotate-code",
  summary: "owner rotates class join code",
  response: okEnvelope(ClassSummarySchema),
});

registerJsonPath({
  method: "get",
  path: "/api/v1/coach/classes/{id}/members",
  summary: "coach+ lists class members",
  response: listEnvelope(ClassMemberSchema),
});

registerJsonPath({
  method: "delete",
  path: "/api/v1/coach/classes/{id}/members/{userId}",
  summary: "owner removes a class member",
  response: okEnvelope(z.unknown()),
});

registerJsonPath({
  method: "get",
  path: "/api/v1/coach/classes/{id}/invites",
  summary: "owner lists class invite links",
  response: listEnvelope(ClassInviteSchema),
});

registerJsonPath({
  method: "post",
  path: "/api/v1/coach/classes/{id}/invites",
  summary: "owner creates a class invite link",
  request: CreateClassInviteBodySchema,
  response: okEnvelope(ClassInviteSchema),
});

registerJsonPath({
  method: "delete",
  path: "/api/v1/coach/classes/{id}/invites/{inviteId}",
  summary: "owner revokes a class invite",
  response: okEnvelope(ClassInviteSchema),
});

registerJsonPath({
  method: "get",
  path: "/api/v1/coach/classes/{id}/coaches",
  summary: "coach+ lists class coaches",
  response: listEnvelope(ClassCoachSchema),
});

registerJsonPath({
  method: "post",
  path: "/api/v1/coach/classes/{id}/coaches",
  summary: "owner adds a collaborator coach",
  request: AddClassCoachBodySchema,
  response: okEnvelope(ClassCoachSchema),
});

registerJsonPath({
  method: "delete",
  path: "/api/v1/coach/classes/{id}/coaches/{userId}",
  summary: "owner removes a collaborator coach",
  response: okEnvelope(ClassCoachSchema),
});

registerJsonPath({
  method: "post",
  path: "/api/v1/coach/classes/{id}/coaches/{userId}/transfer-owner",
  summary: "owner transfers class ownership",
  response: okEnvelope(ClassCoachSchema),
});

registerJsonPath({
  method: "post",
  path: "/api/v1/coach/assignments",
  summary: "coach+ creates a fixed-prebuilt-paper assignment",
  request: CreateAssignmentBodySchema,
  response: okEnvelope(AssignmentSummarySchema),
});

registerJsonPath({
  method: "get",
  path: "/api/v1/coach/classes/{id}/assignments",
  summary: "coach+ lists class assignments",
  response: listEnvelope(AssignmentSummarySchema),
});

registerJsonPath({
  method: "get",
  path: "/api/v1/coach/assignments/{id}",
  summary: "coach+ reads assignment detail and student progress",
  response: okEnvelope(z.unknown()),
});

registerJsonPath({
  method: "patch",
  path: "/api/v1/coach/assignments/{id}",
  summary: "coach+ edits an open assignment",
  request: UpdateAssignmentBodySchema,
  response: okEnvelope(AssignmentSummarySchema),
});

registerJsonPath({
  method: "post",
  path: "/api/v1/coach/assignments/{id}/close",
  summary: "coach+ closes an assignment",
  response: okEnvelope(AssignmentSummarySchema),
});

registerJsonPath({
  method: "get",
  path: "/api/v1/coach/report/{classId}",
  summary: "coach+ reads assignment-only class report",
  response: okEnvelope(ClassReportSchema),
});

registerJsonPath({
  method: "get",
  path: "/api/v1/admin/classes/{id}/coaches",
  summary: "admin lists any class coach group",
  response: listEnvelope(ClassCoachSchema),
});

registerJsonPath({
  method: "post",
  path: "/api/v1/admin/classes/{id}/coaches",
  summary: "admin step-up adds a collaborator coach to any class",
  request: AddClassCoachBodySchema,
  response: okEnvelope(ClassCoachSchema),
});

registerJsonPath({
  method: "delete",
  path: "/api/v1/admin/classes/{id}/coaches/{userId}",
  summary: "admin step-up removes a coach from any class",
  response: okEnvelope(ClassCoachSchema),
});

registerJsonPath({
  method: "post",
  path: "/api/v1/admin/classes/{id}/coaches/{userId}/transfer-owner",
  summary: "admin step-up transfers owner for any class",
  response: okEnvelope(ClassCoachSchema),
});
