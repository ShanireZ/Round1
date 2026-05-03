import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, check } from 'drizzle-orm/pg-core';
import { papers } from './papers.js';
import { users } from './users.js';
export const attempts = pgTable('attempts', {
    id: uuid('id').primaryKey().defaultRandom(),
    paperId: uuid('paper_id').notNull().references(() => papers.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    answersJson: jsonb('answers_json').notNull().default({}),
    score: integer('score'),
    perSectionJson: jsonb('per_section_json'),
    perPrimaryKpJson: jsonb('per_primary_kp_json'),
    tabNonce: uuid('tab_nonce').notNull(),
    status: text('status').notNull().default('started'),
    autoSubmitJobId: text('auto_submit_job_id'),
    aiReportJson: jsonb('ai_report_json'),
    reportStatus: text('report_status'),
    reportError: text('report_error'),
    reportJobId: text('report_job_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
    check('attempts_status_check', sql `${t.status} IN ('started', 'submitted', 'auto_submitted', 'abandoned')`),
    check('attempts_report_status_check', sql `${t.reportStatus} IN ('pending', 'processing', 'completed', 'failed')`),
]);
