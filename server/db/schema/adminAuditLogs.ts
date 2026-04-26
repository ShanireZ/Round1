import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').notNull().references(() => users.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    reauthMethod: text('reauth_method'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('admin_audit_logs_actor_created_idx').on(t.actorUserId, t.createdAt),
    index('admin_audit_logs_action_created_idx').on(t.action, t.createdAt),
  ],
);
