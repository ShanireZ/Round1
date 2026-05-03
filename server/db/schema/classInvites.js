import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { classes } from './classes.js';
export const classInvites = pgTable('class_invites', {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id').notNull().references(() => classes.id),
    tokenHash: text('token_hash').unique().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    maxUses: integer('max_uses').notNull().default(50),
    useCount: integer('use_count').notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [index('class_invites_token_hash_idx').on(t.tokenHash)]);
