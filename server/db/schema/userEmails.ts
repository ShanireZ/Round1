import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const userEmails = pgTable(
  'user_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    email: varchar('email', { length: 255 }).unique().notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    source: text('source').notNull().default('registration'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('user_emails_email_idx').on(t.email),
    uniqueIndex('user_emails_user_id_idx').on(t.userId),
  ],
);
