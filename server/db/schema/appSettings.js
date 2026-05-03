import { pgTable, varchar, jsonb, uuid, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';
export const appSettings = pgTable('app_settings', {
    key: varchar('key', { length: 100 }).primaryKey(),
    valueJson: jsonb('value_json').notNull(),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
