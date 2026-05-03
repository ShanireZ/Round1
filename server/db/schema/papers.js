import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, timestamp, index, check } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { assignments } from "./assignments.js";
import { examTypeCheck } from "./_enums.js";
import { prebuiltPapers } from "./prebuiltPapers.js";
export const papers = pgTable("papers", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id),
    assignmentId: uuid("assignment_id").references(() => assignments.id),
    prebuiltPaperId: uuid("prebuilt_paper_id").references(() => prebuiltPapers.id),
    examType: text("exam_type").notNull(),
    blueprintVersion: integer("blueprint_version").notNull(),
    seed: text("seed").notNull(),
    difficulty: text("difficulty"),
    createdFrom: text("created_from"),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [
    examTypeCheck("papers_exam_type_check", t.examType),
    check("papers_difficulty_check", sql `${t.difficulty} IS NULL OR ${t.difficulty} IN ('easy', 'medium', 'hard')`),
    check("papers_created_from_check", sql `${t.createdFrom} IS NULL OR ${t.createdFrom} IN ('self_practice', 'assignment')`),
    check("papers_status_check", sql `${t.status} IN ('draft', 'active', 'completed', 'abandoned')`),
    index("papers_assignment_id_idx").on(t.assignmentId),
]);
