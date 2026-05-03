import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, primaryKey, index, check } from 'drizzle-orm/pg-core';
import { classes } from './classes.js';
import { users } from './users.js';
export const classCoaches = pgTable('class_coaches', {
    classId: uuid('class_id').notNull().references(() => classes.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    role: text('role').notNull().default('collaborator'),
    addedAt: timestamp('added_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
    primaryKey({ columns: [t.classId, t.userId] }),
    check('class_coaches_role_check', sql `${t.role} IN ('owner', 'collaborator')`),
    index('class_coaches_class_id_idx').on(t.classId),
    index('class_coaches_user_id_idx').on(t.userId),
]);
