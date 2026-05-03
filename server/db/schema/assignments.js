import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, integer, timestamp, check } from "drizzle-orm/pg-core";
import { classes } from "./classes.js";
import { users } from "./users.js";
import { examTypeCheck } from "./_enums.js";
import { prebuiltPapers } from "./prebuiltPapers.js";
export const assignments = pgTable("assignments", {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id")
        .notNull()
        .references(() => classes.id),
    createdBy: uuid("created_by")
        .notNull()
        .references(() => users.id),
    title: varchar("title", { length: 200 }).notNull(),
    mode: text("mode").notNull().default("free"),
    prebuiltPaperId: uuid("prebuilt_paper_id").references(() => prebuiltPapers.id),
    examType: text("exam_type").notNull(),
    blueprintVersion: integer("blueprint_version").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }),
    status: text("status").notNull().default("assigned"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [
    check("assignments_mode_check", sql `${t.mode} IN ('free', 'timed')`),
    examTypeCheck("assignments_exam_type_check", t.examType),
    check("assignments_status_check", sql `${t.status} IN ('assigned', 'closed')`),
]);
