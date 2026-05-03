import { pgTable, uuid, varchar, text, integer, timestamp, index, } from 'drizzle-orm/pg-core';
export const authChallenges = pgTable('auth_challenges', {
    id: uuid('id').primaryKey().defaultRandom(),
    flow: text('flow').notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    codeHash: text('code_hash').notNull(),
    linkTokenHash: text('link_token_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
    index('auth_challenges_email_flow_idx').on(t.email, t.flow, t.createdAt),
    index('auth_challenges_link_token_hash_idx').on(t.linkTokenHash),
]);
