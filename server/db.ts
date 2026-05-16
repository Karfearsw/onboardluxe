import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { resolveDatabaseUrl, runtimeIsStrict } from "./env.js";

const globalForDb = globalThis as typeof globalThis & {
  __oceanLuxePool?: Pool;
  __oceanLuxeDb?: ReturnType<typeof drizzle>;
  __oceanLuxeDbInit?: Promise<void>;
};

function getConnectionString() {
  const value = resolveDatabaseUrl(process.env);
  if (!value) {
    throw new Error("Missing database connection string. Set DATABASE_URL (or POSTGRES_URL / NEON_DATABASE_URL).");
  }

  return value;
}

function shouldUseSsl(connectionString: string) {
  const raw = connectionString.trim();
  if (!raw) return true;

  try {
    const url = new URL(raw);
    const sslmode = (url.searchParams.get("sslmode") || "").toLowerCase();
    if (sslmode === "disable") return false;
    if (sslmode === "allow") return false;
    if (sslmode === "prefer") return false;
    return true;
  } catch {
    return true;
  }
}

function getPoolInstance() {
  if (!globalForDb.__oceanLuxePool) {
    const connectionString = getConnectionString();
    const useSsl = shouldUseSsl(connectionString);
    globalForDb.__oceanLuxePool = new Pool({
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      max: process.env.VERCEL ? 5 : 10,
    });
  }

  return globalForDb.__oceanLuxePool;
}

function getDbInstance() {
  if (!globalForDb.__oceanLuxeDb) {
    globalForDb.__oceanLuxeDb = drizzle(getPoolInstance());
  }

  return globalForDb.__oceanLuxeDb;
}

export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const instance = getPoolInstance() as any;
    const value = instance[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
}) as Pool;

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    const instance = getDbInstance() as any;
    const value = instance[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
}) as ReturnType<typeof drizzle>;

function autoApplyMigrations() {
  if (!runtimeIsStrict(process.env)) return true;
  return (process.env.AUTO_APPLY_MIGRATIONS || "").trim() === "1";
}

async function applyMigrations() {
  await migrate(getDbInstance(), { migrationsFolder: "migrations" });
}

async function assertSchemaReady() {
  const requiredTables = [
    "hr_agents",
    "hr_onboarding_tasks",
    "hr_documents",
    "hr_ica_signatures",
    "hr_training_progress",
    "hr_agent_sessions",
    "hr_status_events",
  ];

  const result = await pool.query<{ name: string; exists: boolean }>(
    `
      select t.name, (to_regclass('public.' || t.name) is not null) as exists
      from unnest($1::text[]) as t(name)
    `,
    [requiredTables],
  );

  const missing = result.rows.filter((row) => !row.exists).map((row) => row.name);
  if (missing.length) {
    throw new Error(`Database schema is not initialized. Missing tables: ${missing.join(", ")}. Run migrations first.`);
  }
}

export async function ensureDatabase() {
  if (!globalForDb.__oceanLuxeDbInit) {
    globalForDb.__oceanLuxeDbInit = autoApplyMigrations() ? applyMigrations() : assertSchemaReady();
  }

  return globalForDb.__oceanLuxeDbInit;
}

export async function migrateDatabase() {
  await applyMigrations();
}
