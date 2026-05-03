import { sql } from 'drizzle-orm';
import { pgTable, uuid, integer, text, primaryKey, check } from 'drizzle-orm/pg-core';
import { papers } from './papers.js';
import { questions } from './questions.js';
export const paperQuestionSlots = pgTable('paper_question_slots', {
    paperId: uuid('paper_id').notNull().references(() => papers.id),
    slotNo: integer('slot_no').notNull(),
    questionType: text('question_type').notNull(),
    primaryKpId: integer('primary_kp_id').notNull(),
    difficulty: text('difficulty').notNull(),
    points: integer('points').notNull(),
    currentQuestionId: uuid('current_question_id').notNull().references(() => questions.id),
}, (t) => [
    primaryKey({ columns: [t.paperId, t.slotNo] }),
    check("paper_question_slots_points_check", sql `${t.points} > 0`),
]);
