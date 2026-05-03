import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { authChallenges } from './authChallenges.js';
export const authTickets = pgTable('auth_tickets', {
    id: uuid('id').primaryKey().defaultRandom(),
    challengeId: uuid('challenge_id').notNull().references(() => authChallenges.id),
    flow: text('flow').notNull(),
    ticketHash: text('ticket_hash').unique().notNull(),
    payloadJson: jsonb('payload_json'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [index('auth_tickets_ticket_hash_idx').on(t.ticketHash)]);
