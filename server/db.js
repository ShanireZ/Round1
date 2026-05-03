import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../config/env.js";
import { isRound1WorkerProcessType, resolveRound1DbApplicationName, } from "../config/processTypes.js";
import * as schema from "./db/schema/index.js";
const processType = process.env.ROUND1_PROCESS_TYPE ?? "";
const isWorker = isRound1WorkerProcessType(processType);
export const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: isWorker ? env.DATABASE_POOL_MAX_WORKER : env.DATABASE_POOL_MAX_API,
    idleTimeoutMillis: 30_000,
    application_name: resolveRound1DbApplicationName(processType),
    statement_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
});
export const db = drizzle(pool, { schema });
export async function checkDbConnection() {
    const client = await pool.connect();
    try {
        await client.query("SELECT 1");
    }
    finally {
        client.release();
    }
}
