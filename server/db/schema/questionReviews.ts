import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, real, jsonb, timestamp, check } from 'drizzle-orm/pg-core';
import { questions } from './questions.js';
import { users } from './users.js';

export const questionReviews = pgTable(
  'question_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id').notNull().references(() => questions.id),
    reviewStatus: text('review_status').notNull().default('pending'),
    aiConfidence: real('ai_confidence'),
    officialAnswerDiff: jsonb('official_answer_diff'),
    reviewerNotes: text('reviewer_notes'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'question_reviews_status_check',
      sql`${t.reviewStatus} IN ('pending', 'ai_reviewed', 'confirmed', 'rejected')`,
    ),
  ],
);
