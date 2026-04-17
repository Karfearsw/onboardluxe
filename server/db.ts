import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();

const globalForDb = globalThis as typeof globalThis & {
  __oceanLuxePool?: Pool;
  __oceanLuxeDb?: ReturnType<typeof drizzle>;
  __oceanLuxeDbInit?: Promise<void>;
};

function getConnectionString() {
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL. Set your Neon/Postgres connection string in Vercel project environment variables.");
  }

  return connectionString;
}

function getPoolInstance() {
  if (!globalForDb.__oceanLuxePool) {
    globalForDb.__oceanLuxePool = new Pool({
      connectionString: getConnectionString(),
      ssl: { rejectUnauthorized: false },
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

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_agents (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      start_date TEXT NOT NULL,
      subscription_status TEXT NOT NULL DEFAULT 'Trial',
      payout_method_type TEXT DEFAULT '',
      payout_details TEXT DEFAULT '',
      sofi_referral_status TEXT NOT NULL DEFAULT 'Not Invited',
      sofi_referral_link TEXT DEFAULT '',
      performance_notes TEXT DEFAULT '',
      crm_record_id TEXT DEFAULT '',
      crm_pipeline_stage TEXT NOT NULL DEFAULT 'Applicant',
      onboarding_step INTEGER NOT NULL DEFAULT 1,
      onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS hr_onboarding_tasks (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      step_number INTEGER NOT NULL,
      task_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      completed_at TEXT DEFAULT '',
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS hr_documents (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      doc_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending Review'
    );

    CREATE TABLE IF NOT EXISTS hr_ica_signatures (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL UNIQUE,
      legal_name TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zip TEXT NOT NULL,
      signature_data_url TEXT NOT NULL,
      signed_at TEXT NOT NULL,
      ip_address TEXT DEFAULT '',
      agreed BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS hr_training_progress (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      module_key TEXT NOT NULL,
      module_name TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      completed_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS hr_agent_sessions (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS hr_agents_email_idx ON hr_agents (email);
    CREATE INDEX IF NOT EXISTS hr_onboarding_tasks_agent_idx ON hr_onboarding_tasks (agent_id);
    CREATE INDEX IF NOT EXISTS hr_documents_agent_idx ON hr_documents (agent_id);
    CREATE INDEX IF NOT EXISTS hr_training_progress_agent_idx ON hr_training_progress (agent_id);
    CREATE INDEX IF NOT EXISTS hr_agent_sessions_agent_idx ON hr_agent_sessions (agent_id);
    CREATE INDEX IF NOT EXISTS hr_agent_sessions_expires_idx ON hr_agent_sessions (expires_at);

    CREATE OR REPLACE VIEW hr_agent_summary AS
    SELECT
      a.id,
      a.name,
      a.email,
      a.phone,
      a.start_date,
      a.subscription_status,
      a.payout_method_type,
      a.sofi_referral_status,
      a.crm_record_id,
      a.crm_pipeline_stage,
      a.onboarding_step,
      a.onboarding_complete,
      (
        SELECT COUNT(*)
        FROM hr_onboarding_tasks t
        WHERE t.agent_id = a.id AND t.status = 'complete'
      ) AS completed_task_count,
      (
        SELECT COUNT(*)
        FROM hr_documents d
        WHERE d.agent_id = a.id AND d.status = 'Pending Review'
      ) AS pending_document_count,
      (
        SELECT COUNT(*)
        FROM hr_training_progress tp
        WHERE tp.agent_id = a.id AND tp.completed = TRUE
      ) AS completed_training_count
    FROM hr_agents a;
  `);
}

export async function ensureDatabase() {
  if (!globalForDb.__oceanLuxeDbInit) {
    globalForDb.__oceanLuxeDbInit = initializeDatabase();
  }

  return globalForDb.__oceanLuxeDbInit;
}
