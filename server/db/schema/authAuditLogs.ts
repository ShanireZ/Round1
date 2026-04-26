import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const authAuditLogs = pgTable(
  'auth_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    action: text('action').notNull(),
    identifierHash: text('identifier_hash'),
    provider: text('provider'),
    ip: text('ip').notNull(),
    deviceIdHash: text('device_id_hash'),
    riskScore: integer('risk_score'),
    result: text('result').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('auth_audit_logs_user_created_idx').on(t.userId, t.createdAt)],
);
