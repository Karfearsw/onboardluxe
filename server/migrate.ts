import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    onboarding_step INTEGER NOT NULL DEFAULT 1,
    onboarding_complete INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS onboarding_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    step_number INTEGER NOT NULL,
    task_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    completed_at TEXT DEFAULT '',
    notes TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    doc_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending Review'
  );

  CREATE TABLE IF NOT EXISTS ica_signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL UNIQUE,
    legal_name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip TEXT NOT NULL,
    signature_data_url TEXT NOT NULL,
    signed_at TEXT NOT NULL,
    ip_address TEXT DEFAULT '',
    agreed INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS training_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    module_key TEXT NOT NULL,
    module_name TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT DEFAULT ''
  );
`);

console.log("Database initialized successfully.");
sqlite.close();
