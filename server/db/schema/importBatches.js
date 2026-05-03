import { sql } from "drizzle-orm";
import { pgTable, uuid, text, varchar, jsonb, timestamp, check, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
export const importBatches = pgTable("import_batches", {
    id: uuid("id").primaryKey().defaultRandom(),
    bundleType: text("bundle_type").notNull(),
    sourceFilename: varchar("source_filename", { length: 255 }).notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    status: text("status").notNull().default("dry_run"),
    summaryJson: jsonb("summary_json")
        .notNull()
        .default(sql `'{}'::jsonb`),
    importedBy: uuid("imported_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [
    check("import_batches_bundle_type_check", sql `${t.bundleType} IN ('question_bundle', 'prebuilt_paper_bundle', 'manual_question_import')`),
    check("import_batches_status_check", sql `${t.status} IN ('dry_run', 'processing', 'applied', 'partial_failed', 'failed')`),
    index("import_batches_bundle_type_created_at_idx").on(t.bundleType, t.createdAt),
]);
