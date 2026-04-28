import { Catalog } from "@a2ui/web_core/v0_9";
import {
  basicCatalog,
  createComponentImplementation,
  type ReactComponentImplementation,
} from "@a2ui/react/v0_9";
import { z } from "zod/v3";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { scoreOrDash } from "@/lib/coach";

export const ROUND1_A2UI_CATALOG_ID = "round1://a2ui/catalog/design-system/v1";

const DataBindingSchema = z.object({ path: z.string() });
const DynamicStringSchema = z.union([z.string(), DataBindingSchema]);
const DynamicNumberSchema = z.union([z.number(), DataBindingSchema]);
const DynamicBooleanSchema = z.union([z.boolean(), DataBindingSchema]);

const Round1CoachReportSnapshotSchema = z.object({
  title: DynamicStringSchema,
  students: DynamicNumberSchema,
  averageScore: DynamicNumberSchema,
  completionRate: DynamicNumberSchema,
  printReady: DynamicBooleanSchema,
  tone: z.enum(["stable", "risk", "improving"]).default("stable"),
});

const Round1CoachClassSnapshotSchema = z.object({
  title: DynamicStringSchema,
  classCount: DynamicNumberSchema,
  activeClasses: DynamicNumberSchema,
  students: DynamicNumberSchema,
  openAssignments: DynamicNumberSchema,
  inviteReady: DynamicBooleanSchema,
  tone: z.enum(["stable", "risk", "improving"]).default("stable"),
});

const Round1CoachClassDetailSnapshotSchema = z.object({
  title: DynamicStringSchema,
  members: DynamicNumberSchema,
  coaches: DynamicNumberSchema,
  activeInvites: DynamicNumberSchema,
  ownerReady: DynamicBooleanSchema,
  inviteReady: DynamicBooleanSchema,
  tone: z.enum(["stable", "risk", "improving"]).default("stable"),
});

const Round1StudentClassSnapshotSchema = z.object({
  title: DynamicStringSchema,
  joinedClasses: DynamicNumberSchema,
  openAssignments: DynamicNumberSchema,
  completedAssignments: DynamicNumberSchema,
  inviteReady: DynamicBooleanSchema,
  tone: z.enum(["stable", "risk", "improving"]).default("stable"),
});

const Round1AccountSecuritySnapshotSchema = z.object({
  title: DynamicStringSchema,
  emailVerified: DynamicBooleanSchema,
  passwordEnabled: DynamicBooleanSchema,
  totpEnabled: DynamicBooleanSchema,
  passkeys: DynamicNumberSchema,
  externalBindings: DynamicNumberSchema,
  tone: z.enum(["stable", "risk", "improving"]).default("stable"),
});

const Round1AuthEntrySnapshotSchema = z.object({
  title: DynamicStringSchema,
  authPages: DynamicNumberSchema,
  callbackReady: DynamicBooleanSchema,
  notFoundReady: DynamicBooleanSchema,
  completionRate: DynamicNumberSchema,
  tone: z.enum(["stable", "risk", "improving"]).default("stable"),
});

const Round1AdminQuestionSnapshotSchema = z.object({
  title: DynamicStringSchema,
  draftQuestions: DynamicNumberSchema,
  reviewedQuestions: DynamicNumberSchema,
  publishedQuestions: DynamicNumberSchema,
  archivedQuestions: DynamicNumberSchema,
  referenceChecks: DynamicNumberSchema,
  sandboxCoverage: DynamicNumberSchema,
  tone: z.enum(["stable", "risk", "improving"]).default("stable"),
});

const Round1AdminPaperSnapshotSchema = z.object({
  title: DynamicStringSchema,
  draftPapers: DynamicNumberSchema,
  publishedPapers: DynamicNumberSchema,
  archivedPapers: DynamicNumberSchema,
  slotCount: DynamicNumberSchema,
  copyVersionReady: DynamicBooleanSchema,
  immutableReady: DynamicBooleanSchema,
  tone: z.enum(["stable", "risk", "improving"]).default("stable"),
});

const Round1AdminImportSnapshotSchema = z.object({
  title: DynamicStringSchema,
  dryRuns: DynamicNumberSchema,
  appliedImports: DynamicNumberSchema,
  failedImports: DynamicNumberSchema,
  rejectedItems: DynamicNumberSchema,
  sharedSummaryReady: DynamicBooleanSchema,
  repairReady: DynamicBooleanSchema,
  tone: z.enum(["stable", "risk", "improving"]).default("stable"),
});

const Round1CoachReportSnapshotApi = {
  name: "Round1CoachReportSnapshot",
  schema: Round1CoachReportSnapshotSchema as unknown as ReactComponentImplementation["schema"],
};

const Round1CoachClassSnapshotApi = {
  name: "Round1CoachClassSnapshot",
  schema: Round1CoachClassSnapshotSchema as unknown as ReactComponentImplementation["schema"],
};

const Round1CoachClassDetailSnapshotApi = {
  name: "Round1CoachClassDetailSnapshot",
  schema: Round1CoachClassDetailSnapshotSchema as unknown as ReactComponentImplementation["schema"],
};

const Round1StudentClassSnapshotApi = {
  name: "Round1StudentClassSnapshot",
  schema: Round1StudentClassSnapshotSchema as unknown as ReactComponentImplementation["schema"],
};

const Round1AccountSecuritySnapshotApi = {
  name: "Round1AccountSecuritySnapshot",
  schema: Round1AccountSecuritySnapshotSchema as unknown as ReactComponentImplementation["schema"],
};

const Round1AuthEntrySnapshotApi = {
  name: "Round1AuthEntrySnapshot",
  schema: Round1AuthEntrySnapshotSchema as unknown as ReactComponentImplementation["schema"],
};

const Round1AdminQuestionSnapshotApi = {
  name: "Round1AdminQuestionSnapshot",
  schema: Round1AdminQuestionSnapshotSchema as unknown as ReactComponentImplementation["schema"],
};

const Round1AdminPaperSnapshotApi = {
  name: "Round1AdminPaperSnapshot",
  schema: Round1AdminPaperSnapshotSchema as unknown as ReactComponentImplementation["schema"],
};

const Round1AdminImportSnapshotApi = {
  name: "Round1AdminImportSnapshot",
  schema: Round1AdminImportSnapshotSchema as unknown as ReactComponentImplementation["schema"],
};

const toneBadgeVariant = {
  stable: "outline",
  risk: "tle",
  improving: "saved",
} as const;

const toneLabel = {
  stable: "稳定",
  risk: "需跟进",
  improving: "改善中",
} as const;

type Round1SnapshotTone = keyof typeof toneLabel;

function isRound1SnapshotTone(value: unknown): value is Round1SnapshotTone {
  return typeof value === "string" && value in toneLabel;
}

function clampPercent(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function SnapshotMetric({
  label,
  value,
  caption,
}: {
  label: string;
  value: number | string;
  caption?: string;
}) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {caption ? <div className="text-muted-foreground mt-1 text-xs">{caption}</div> : null}
    </div>
  );
}

const Round1CoachReportSnapshot = createComponentImplementation(
  Round1CoachReportSnapshotApi,
  ({ props }) => {
    const title = props.title ?? "CoachReport";
    const students = props.students ?? 0;
    const averageScore = props.averageScore ?? 0;
    const completionRate = props.completionRate ?? 0;
    const printReady = props.printReady ?? false;
    const tone = props.tone ?? "stable";
    const safeTone = isRound1SnapshotTone(tone) ? tone : "stable";
    const completionPercent = clampPercent(completionRate * 100);

    return (
      <Card variant="flat" className="a2ui-round1-snapshot border-border bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-muted-foreground text-xs">Round1 BYOC</div>
              <div className="text-foreground mt-1 text-lg font-semibold">{title}</div>
            </div>
            <Badge variant={toneBadgeVariant[safeTone]}>{toneLabel[safeTone]}</Badge>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-muted-foreground text-xs">学生</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {students}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">均分</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {scoreOrDash(averageScore)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">打印</div>
              <div className="text-foreground mt-1 text-sm font-medium">
                {printReady ? "已标记" : "待验收"}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">完成率</span>
              <span className="text-foreground tabular-nums">{completionPercent}%</span>
            </div>
            <Progress value={completionPercent} variant="exam" />
          </div>
        </CardContent>
      </Card>
    );
  },
);

const Round1CoachClassSnapshot = createComponentImplementation(
  Round1CoachClassSnapshotApi,
  ({ props }) => {
    const title = props.title ?? "CoachClasses";
    const classCount = props.classCount ?? 0;
    const activeClasses = props.activeClasses ?? 0;
    const students = props.students ?? 0;
    const openAssignments = props.openAssignments ?? 0;
    const inviteReady = props.inviteReady ?? false;
    const tone = props.tone ?? "stable";
    const safeTone = isRound1SnapshotTone(tone) ? tone : "stable";
    const activePercent = classCount > 0 ? clampPercent((activeClasses / classCount) * 100) : 0;

    return (
      <Card variant="flat" className="a2ui-round1-snapshot border-border bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-muted-foreground text-xs">Round1 BYOC</div>
              <div className="text-foreground mt-1 text-lg font-semibold">{title}</div>
            </div>
            <Badge variant={toneBadgeVariant[safeTone]}>{toneLabel[safeTone]}</Badge>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-muted-foreground text-xs">班级</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {classCount}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">学生</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {students}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">任务</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {openAssignments}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {inviteReady ? "班级码可分发" : "邀请码待确认"}
              </span>
              <span className="text-foreground tabular-nums">{activePercent}% active</span>
            </div>
            <Progress value={activePercent} variant="exam" />
          </div>
        </CardContent>
      </Card>
    );
  },
);

const Round1StudentClassSnapshot = createComponentImplementation(
  Round1StudentClassSnapshotApi,
  ({ props }) => {
    const title = props.title ?? "MyClasses";
    const joinedClasses = props.joinedClasses ?? 0;
    const openAssignments = props.openAssignments ?? 0;
    const completedAssignments = props.completedAssignments ?? 0;
    const inviteReady = props.inviteReady ?? false;
    const tone = props.tone ?? "stable";
    const safeTone = isRound1SnapshotTone(tone) ? tone : "stable";
    const completionPercent =
      completedAssignments + openAssignments > 0
        ? clampPercent((completedAssignments / (completedAssignments + openAssignments)) * 100)
        : 0;

    return (
      <Card variant="flat" className="a2ui-round1-snapshot border-border bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-muted-foreground text-xs">Round1 BYOC</div>
              <div className="text-foreground mt-1 text-lg font-semibold">{title}</div>
            </div>
            <Badge variant={toneBadgeVariant[safeTone]}>{toneLabel[safeTone]}</Badge>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-muted-foreground text-xs">班级</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {joinedClasses}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">待完成</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {openAssignments}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">已完成</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {completedAssignments}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {inviteReady ? "邀请入口可用" : "等待班级码"}
              </span>
              <span className="text-foreground tabular-nums">{completionPercent}% done</span>
            </div>
            <Progress value={completionPercent} variant="exam" />
          </div>
        </CardContent>
      </Card>
    );
  },
);

const Round1CoachClassDetailSnapshot = createComponentImplementation(
  Round1CoachClassDetailSnapshotApi,
  ({ props }) => {
    const title = props.title ?? "CoachClassDetail";
    const members = props.members ?? 0;
    const coaches = props.coaches ?? 0;
    const activeInvites = props.activeInvites ?? 0;
    const ownerReady = props.ownerReady ?? false;
    const inviteReady = props.inviteReady ?? false;
    const tone = props.tone ?? "stable";
    const safeTone = isRound1SnapshotTone(tone) ? tone : "stable";
    const governancePercent = clampPercent(
      ((ownerReady ? 1 : 0) + (inviteReady ? 1 : 0) + Math.min(coaches, 2) / 2) * (100 / 3),
    );

    return (
      <Card variant="flat" className="a2ui-round1-snapshot border-border bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-muted-foreground text-xs">Round1 BYOC</div>
              <div className="text-foreground mt-1 text-lg font-semibold">{title}</div>
            </div>
            <Badge variant={toneBadgeVariant[safeTone]}>{toneLabel[safeTone]}</Badge>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-muted-foreground text-xs">成员</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {members}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">教练</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {coaches}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">邀请</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {activeInvites}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {ownerReady ? "owner 边界已就绪" : "等待 owner 审核"}
              </span>
              <span className="text-foreground tabular-nums">{governancePercent}% managed</span>
            </div>
            <Progress value={governancePercent} variant="exam" />
          </div>
        </CardContent>
      </Card>
    );
  },
);

const Round1AccountSecuritySnapshot = createComponentImplementation(
  Round1AccountSecuritySnapshotApi,
  ({ props }) => {
    const title = props.title ?? "AccountSecurity";
    const emailVerified = props.emailVerified ?? false;
    const passwordEnabled = props.passwordEnabled ?? false;
    const totpEnabled = props.totpEnabled ?? false;
    const passkeys = props.passkeys ?? 0;
    const externalBindings = props.externalBindings ?? 0;
    const tone = props.tone ?? "stable";
    const safeTone = isRound1SnapshotTone(tone) ? tone : "stable";
    const securitySignals = [
      emailVerified,
      passwordEnabled,
      totpEnabled,
      passkeys > 0,
      externalBindings > 0,
    ].filter(Boolean).length;
    const securityPercent = clampPercent((securitySignals / 5) * 100);

    return (
      <Card variant="flat" className="a2ui-round1-snapshot border-border bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-muted-foreground text-xs">Round1 BYOC</div>
              <div className="text-foreground mt-1 text-lg font-semibold">{title}</div>
            </div>
            <Badge variant={toneBadgeVariant[safeTone]}>{toneLabel[safeTone]}</Badge>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-muted-foreground text-xs">邮箱</div>
              <div className="text-foreground mt-1 text-sm font-medium">
                {emailVerified ? "verified" : "pending"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">TOTP</div>
              <div className="text-foreground mt-1 text-sm font-medium">
                {totpEnabled ? "enabled" : "off"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Passkey</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {passkeys}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {passwordEnabled ? `${externalBindings} external binding` : "password pending"}
              </span>
              <span className="text-foreground tabular-nums">{securityPercent}% covered</span>
            </div>
            <Progress value={securityPercent} variant="exam" />
          </div>
        </CardContent>
      </Card>
    );
  },
);

const Round1AuthEntrySnapshot = createComponentImplementation(
  Round1AuthEntrySnapshotApi,
  ({ props }) => {
    const title = props.title ?? "AuthEntrypoints";
    const authPages = props.authPages ?? 0;
    const callbackReady = props.callbackReady ?? false;
    const notFoundReady = props.notFoundReady ?? false;
    const completionRate = props.completionRate ?? 0;
    const tone = props.tone ?? "stable";
    const safeTone = isRound1SnapshotTone(tone) ? tone : "stable";
    const completionPercent = clampPercent(completionRate * 100);

    return (
      <Card variant="flat" className="a2ui-round1-snapshot border-border bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-muted-foreground text-xs">Round1 BYOC</div>
              <div className="text-foreground mt-1 text-lg font-semibold">{title}</div>
            </div>
            <Badge variant={toneBadgeVariant[safeTone]}>{toneLabel[safeTone]}</Badge>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-muted-foreground text-xs">入口页</div>
              <div className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                {authPages}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Callback</div>
              <div className="text-foreground mt-1 text-sm font-medium">
                {callbackReady ? "ready" : "pending"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">404</div>
              <div className="text-foreground mt-1 text-sm font-medium">
                {notFoundReady ? "ready" : "pending"}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">AuthLayout coverage</span>
              <span className="text-foreground tabular-nums">{completionPercent}%</span>
            </div>
            <Progress value={completionPercent} variant="exam" />
          </div>
        </CardContent>
      </Card>
    );
  },
);

const Round1AdminQuestionSnapshot = createComponentImplementation(
  Round1AdminQuestionSnapshotApi,
  ({ props }) => {
    const title = props.title ?? "AdminQuestionLibrary";
    const draftQuestions = props.draftQuestions ?? 0;
    const reviewedQuestions = props.reviewedQuestions ?? 0;
    const publishedQuestions = props.publishedQuestions ?? 0;
    const archivedQuestions = props.archivedQuestions ?? 0;
    const referenceChecks = props.referenceChecks ?? 0;
    const sandboxCoverage = props.sandboxCoverage ?? 0;
    const tone = props.tone ?? "stable";
    const safeTone = isRound1SnapshotTone(tone) ? tone : "stable";
    const totalQuestions =
      draftQuestions + reviewedQuestions + publishedQuestions + archivedQuestions;
    const sandboxPercent = clampPercent(sandboxCoverage * 100);

    return (
      <Card variant="flat" className="a2ui-round1-snapshot border-border bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-muted-foreground text-xs">Round1 BYOC</div>
              <div className="text-foreground mt-1 text-lg font-semibold">{title}</div>
            </div>
            <Badge variant={toneBadgeVariant[safeTone]}>{toneLabel[safeTone]}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SnapshotMetric label="Draft" value={draftQuestions} />
            <SnapshotMetric label="Reviewed" value={reviewedQuestions} />
            <SnapshotMetric label="Published" value={publishedQuestions} />
            <SnapshotMetric label="Archived" value={archivedQuestions} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {referenceChecks} reference checks / {totalQuestions} lifecycle items
              </span>
              <span className="text-foreground tabular-nums">{sandboxPercent}% sandbox</span>
            </div>
            <Progress value={sandboxPercent} variant="exam" />
          </div>
        </CardContent>
      </Card>
    );
  },
);

const Round1AdminPaperSnapshot = createComponentImplementation(
  Round1AdminPaperSnapshotApi,
  ({ props }) => {
    const title = props.title ?? "AdminPaperLibrary";
    const draftPapers = props.draftPapers ?? 0;
    const publishedPapers = props.publishedPapers ?? 0;
    const archivedPapers = props.archivedPapers ?? 0;
    const slotCount = props.slotCount ?? 0;
    const copyVersionReady = props.copyVersionReady ?? false;
    const immutableReady = props.immutableReady ?? false;
    const tone = props.tone ?? "stable";
    const safeTone = isRound1SnapshotTone(tone) ? tone : "stable";
    const governancePercent = clampPercent(
      ((copyVersionReady ? 1 : 0) + (immutableReady ? 1 : 0) + (publishedPapers > 0 ? 1 : 0)) *
        (100 / 3),
    );

    return (
      <Card variant="flat" className="a2ui-round1-snapshot border-border bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-muted-foreground text-xs">Round1 BYOC</div>
              <div className="text-foreground mt-1 text-lg font-semibold">{title}</div>
            </div>
            <Badge variant={toneBadgeVariant[safeTone]}>{toneLabel[safeTone]}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SnapshotMetric label="Draft" value={draftPapers} />
            <SnapshotMetric label="Published" value={publishedPapers} />
            <SnapshotMetric label="Archived" value={archivedPapers} />
            <SnapshotMetric label="Slots" value={slotCount} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {copyVersionReady ? "copy-version ready" : "copy-version pending"} /{" "}
                {immutableReady ? "immutable published" : "immutability pending"}
              </span>
              <span className="text-foreground tabular-nums">{governancePercent}% governed</span>
            </div>
            <Progress value={governancePercent} variant="exam" />
          </div>
        </CardContent>
      </Card>
    );
  },
);

const Round1AdminImportSnapshot = createComponentImplementation(
  Round1AdminImportSnapshotApi,
  ({ props }) => {
    const title = props.title ?? "AdminImports";
    const dryRuns = props.dryRuns ?? 0;
    const appliedImports = props.appliedImports ?? 0;
    const failedImports = props.failedImports ?? 0;
    const rejectedItems = props.rejectedItems ?? 0;
    const sharedSummaryReady = props.sharedSummaryReady ?? false;
    const repairReady = props.repairReady ?? false;
    const tone = props.tone ?? "stable";
    const safeTone = isRound1SnapshotTone(tone) ? tone : "stable";
    const totalBatches = appliedImports + failedImports;
    const appliedPercent =
      totalBatches > 0 ? clampPercent((appliedImports / totalBatches) * 100) : 0;

    return (
      <Card variant="flat" className="a2ui-round1-snapshot border-border bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-muted-foreground text-xs">Round1 BYOC</div>
              <div className="text-foreground mt-1 text-lg font-semibold">{title}</div>
            </div>
            <Badge variant={toneBadgeVariant[safeTone]}>{toneLabel[safeTone]}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SnapshotMetric label="Dry runs" value={dryRuns} />
            <SnapshotMetric label="Applied" value={appliedImports} />
            <SnapshotMetric label="Failed" value={failedImports} />
            <SnapshotMetric label="Rejected" value={rejectedItems} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {sharedSummaryReady ? "shared summary" : "summary pending"} /{" "}
                {repairReady ? "repair retry ready" : "repair retry pending"}
              </span>
              <span className="text-foreground tabular-nums">{appliedPercent}% applied</span>
            </div>
            <Progress value={appliedPercent} variant="exam" />
          </div>
        </CardContent>
      </Card>
    );
  },
);

export const round1A2uiCatalog = new Catalog<ReactComponentImplementation>(ROUND1_A2UI_CATALOG_ID, [
  ...basicCatalog.components.values(),
  Round1CoachReportSnapshot,
  Round1CoachClassSnapshot,
  Round1CoachClassDetailSnapshot,
  Round1StudentClassSnapshot,
  Round1AccountSecuritySnapshot,
  Round1AuthEntrySnapshot,
  Round1AdminQuestionSnapshot,
  Round1AdminPaperSnapshot,
  Round1AdminImportSnapshot,
]);
