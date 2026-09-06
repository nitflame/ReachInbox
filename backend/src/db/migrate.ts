import fs from "fs";
import path from "path";
import { pool } from "../config/db";

/**
 * Minimal, dependency-free migration runner.
 *
 * Applies every .sql file in ./migrations, in filename order, exactly once,
 * tracked via a `schema_migrations` table. Good enough for this stage of
 * the project without pulling in a full migration framework.
 */

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        VARCHAR(255) PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>("SELECT name FROM schema_migrations");
  return new Set(result.rows.map((r) => r.name));
}

async function runMigrations(): Promise<void> {
  console.log("🔧 Running database migrations...");

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found.");
    return;
  }

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`⏭️  Skipping already-applied migration: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`✅ Applied migration: ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`❌ Failed to apply migration: ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log("🎉 All migrations applied.");
}

runMigrations()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end().finally(() => process.exit(1));
  });
