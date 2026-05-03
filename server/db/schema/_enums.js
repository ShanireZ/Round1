import { sql } from "drizzle-orm";
import { check } from "drizzle-orm/pg-core";
export { EXAM_TYPES } from "../../../config/examTypes.js";
export const examTypeCheck = (name, col) => check(name, sql `${col} IN ('CSP-J','CSP-S','GESP-1','GESP-2','GESP-3','GESP-4','GESP-5','GESP-6','GESP-7','GESP-8')`);
