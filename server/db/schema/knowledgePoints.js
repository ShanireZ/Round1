import { pgTable, serial, varchar, text, integer, timestamp } from 'drizzle-orm/pg-core';
export const knowledgePoints = pgTable('knowledge_points', {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 50 }).unique().notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    category: text('category').notNull(),
    parentId: integer('parent_id').references(() => knowledgePoints.id),
    blueprintWeight: integer('blueprint_weight').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
