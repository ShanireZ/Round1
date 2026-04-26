import { pgTable, text, integer, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core';

export const blueprints = pgTable(
  'blueprints',
  {
    examType: text('exam_type').notNull(),
    version: integer('version').notNull(),
    specJson: jsonb('spec_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.examType, t.version] })],
);
