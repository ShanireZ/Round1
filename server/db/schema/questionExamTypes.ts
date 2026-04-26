import { pgTable, uuid, text, primaryKey } from 'drizzle-orm/pg-core';
import { questions } from './questions.js';
import { examTypeCheck } from './_enums.js';

export const questionExamTypes = pgTable(
  'question_exam_types',
  {
    questionId: uuid('question_id').notNull().references(() => questions.id),
    examType: text('exam_type').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.questionId, t.examType] }),
    examTypeCheck('question_exam_types_exam_type_check', t.examType),
  ],
);
