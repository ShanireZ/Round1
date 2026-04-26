import { sql } from "drizzle-orm";
import { pgTable, uuid, integer, text, primaryKey, check } from "drizzle-orm/pg-core";
import { prebuiltPapers } from "./prebuiltPapers.js";
import { questions } from "./questions.js";
import { knowledgePoints } from "./knowledgePoints.js";

export const prebuiltPaperSlots = pgTable(
  "prebuilt_paper_slots",
  {
    prebuiltPaperId: uuid("prebuilt_paper_id")
      .notNull()
      .references(() => prebuiltPapers.id),
    slotNo: integer("slot_no").notNull(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    questionType: text("question_type").notNull(),
    primaryKpId: integer("primary_kp_id")
      .notNull()
      .references(() => knowledgePoints.id),
    difficulty: text("difficulty").notNull(),
    points: integer("points").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.prebuiltPaperId, t.slotNo] }),
    check(
      "prebuilt_paper_slots_question_type_check",
      sql`${t.questionType} IN ('single_choice', 'reading_program', 'completion_program')`,
    ),
    check(
      "prebuilt_paper_slots_difficulty_check",
      sql`${t.difficulty} IN ('easy', 'medium', 'hard')`,
    ),
    check("prebuilt_paper_slots_points_check", sql`${t.points} > 0`),
  ],
);
