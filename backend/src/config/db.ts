import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import { env } from "./env";

const useSsl =
  env.PG_SSL ||
  env.DATABASE_URL.includes("sslmode=require") ||
  env.DATABASE_URL.includes("ssl=true");

const poolConfig: PoolConfig = {
  connectionString: env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

export const pool = new Pool(poolConfig);

pool.on("error", (err) => {
  // Errors on idle clients (e.g. connection dropped) should not crash the process.
  console.error("❌ Unexpected error on idle PostgreSQL client", err);
});

/**
 * Thin query helper so callers don't need to import `pool` everywhere.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function checkDbConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (err) {
    console.error("❌ PostgreSQL connection check failed:", err);
    return false;
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
