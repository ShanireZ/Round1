import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  check,
  index,
  type AnyPgColumn,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { examTypeCheck } from "./_enums.js";
import { importBatches } from "./importBatches.js";

export const prebuiltPapers = pgTable(
  "prebuilt_papers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 200 }).notNull(),
    examType: text("exam_type").notNull(),
    difficulty: text("difficulty").notNull(),
    blueprintVersion: integer("blueprint_version").notNull(),
    rootPaperId: uuid("root_paper_id")
      .notNull()
      .references((): AnyPgColumn => prebuiltPapers.id),
    parentPaperId: uuid("parent_paper_id").references((): AnyPgColumn => prebuiltPapers.id),
    versionNo: integer("version_no").notNull().default(1),
    status: text("status").notNull().default("draft"),
    sourceBatchId: uuid("source_batch_id").references(() => importBatches.id),
    metadataJson: jsonb("metadata_json")
      .notNull()
      .default(sql`'{}'::jsonb`),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    examTypeCheck("prebuilt_papers_exam_type_check", t.examType),
    check("prebuilt_papers_difficulty_check", sql`${t.difficulty} IN ('easy', 'medium', 'hard')`),
    check("prebuilt_papers_version_no_check", sql`${t.versionNo} > 0`),
    check("prebuilt_papers_status_check", sql`${t.status} IN ('draft', 'published', 'archived')`),
    index("prebuilt_papers_status_exam_type_difficulty_idx").on(t.status, t.examType, t.difficulty),
    uniqueIndex("prebuilt_papers_root_paper_version_no_idx").on(t.rootPaperId, t.versionNo),
  ],
);
