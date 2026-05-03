import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, integer, timestamp, index, check, boolean, } from 'drizzle-orm/pg-core';
export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    username: varchar('username', { length: 50 }).unique().notNull(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    passwordHash: text('password_hash'),
    passwordChangeRequired: boolean('password_change_required').notNull().default(false),
    role: text('role').notNull().default('student'),
    sessionVersion: integer('session_version').notNull().default(1),
    status: text('status').notNull().default('active'),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    lastStrongAuthAt: timestamp('last_strong_auth_at', { withTimezone: true, mode: 'date' }),
    totpSecretEnc: text('totp_secret_enc'),
    totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
    check('users_role_check', sql `${t.role} IN ('student', 'coach', 'admin')`),
    check('users_status_check', sql `${t.status} IN ('active', 'locked', 'deleted')`),
    index('users_username_idx').on(t.username),
]);
