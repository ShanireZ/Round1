import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, primaryKey, check } from 'drizzle-orm/pg-core';
import { classes } from './classes.js';
import { users } from './users.js';

export const classMembers = pgTable(
  'class_members',
  {
    classId: uuid('class_id').notNull().references(() => classes.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    joinedVia: text('joined_via').notNull().default('code'),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.classId, t.userId] }),
    check('class_members_joined_via_check', sql`${t.joinedVia} IN ('code', 'invite_link')`),
  ],
);
