import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  varchar,
  boolean,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { knowledgePoints } from "./knowledgePoints.js";

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    difficulty: text("difficulty").notNull(),
    primaryKpId: integer("primary_kp_id")
      .notNull()
      .references(() => knowledgePoints.id),
    contentJson: jsonb("content_json").notNull(),
    answerJson: jsonb("answer_json").notNull(),
    explanationJson: jsonb("explanation_json").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).unique().notNull(),
    status: text("status").notNull().default("draft"),
    sandboxVerified: boolean("sandbox_verified").notNull().default(false),
    source: text("source").notNull().default("ai"),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "questions_type_check",
      sql`${t.type} IN ('single_choice', 'reading_program', 'completion_program')`,
    ),
    check("questions_difficulty_check", sql`${t.difficulty} IN ('easy', 'medium', 'hard')`),
    check(
      "questions_status_check",
      sql`${t.status} IN ('draft', 'reviewed', 'published', 'archived')`,
    ),
    check("questions_source_check", sql`${t.source} IN ('ai', 'manual', 'real_paper')`),
    index("questions_composite_idx").on(t.status, t.type, t.primaryKpId, t.difficulty),
  ],
);
