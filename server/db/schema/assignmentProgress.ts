import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, primaryKey, check } from 'drizzle-orm/pg-core';
import { assignments } from './assignments.js';
import { users } from './users.js';
import { papers } from './papers.js';
import { attempts } from './attempts.js';

export const assignmentProgress = pgTable(
  'assignment_progress',
  {
    assignmentId: uuid('assignment_id').notNull().references(() => assignments.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    paperId: uuid('paper_id').references(() => papers.id),
    attemptId: uuid('attempt_id').references(() => attempts.id),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.assignmentId, t.userId] }),
    check(
      'assignment_progress_status_check',
      sql`${t.status} IN ('pending', 'in_progress', 'completed', 'missed')`,
    ),
  ],
);
