import { sql } from "drizzle-orm";
import { check } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
export { EXAM_TYPES, type ExamType } from "../../../config/examTypes.js";

export const examTypeCheck = (name: string, col: AnyPgColumn) =>
  check(
    name,
    sql`${col} IN ('CSP-J','CSP-S','GESP-1','GESP-2','GESP-3','GESP-4','GESP-5','GESP-6','GESP-7','GESP-8')`,
  );
