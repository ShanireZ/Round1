import { sql } from 'drizzle-orm';
import { pgTable, uuid, integer, text, primaryKey, check } from 'drizzle-orm/pg-core';
import { questions } from './questions.js';
import { knowledgePoints } from './knowledgePoints.js';

export const questionKpTags = pgTable(
  'question_kp_tags',
  {
    questionId: uuid('question_id').notNull().references(() => questions.id),
    kpId: integer('kp_id').notNull().references(() => knowledgePoints.id),
    tagRole: text('tag_role').notNull().default('primary'),
  },
  (t) => [
    primaryKey({ columns: [t.questionId, t.kpId] }),
    check('question_kp_tags_role_check', sql`${t.tagRole} IN ('primary', 'secondary')`),
  ],
);
