import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { agents, onboardingTasks, documents, icaSignatures, trainingProgress } from "../shared/schema";

const dbPath = process.env.VERCEL ? "/tmp/data.db" : "data.db";
const sqlite = new Database(dbPath);
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
export const db = drizzle(sqlite);
import type {
  Agent, InsertAgent,
  OnboardingTask, InsertOnboardingTask,
  Document, InsertDocument,
  IcaSignature, InsertIcaSignature,
  TrainingProgress, InsertTrainingProgress,
} from "../shared/schema";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // Agents
  getAgent(id: number): Agent | undefined;
  getAgentByEmail(email: string): Agent | undefined;
  getAllAgents(): Agent[];
  createAgent(data: InsertAgent): Agent;
  updateAgent(id: number, data: Partial<InsertAgent>): Agent | undefined;

  // Onboarding Tasks
  getOnboardingTasks(agentId: number): OnboardingTask[];
  upsertOnboardingTask(data: InsertOnboardingTask): OnboardingTask;
  updateTaskStatus(agentId: number, taskKey: string, status: string): OnboardingTask | undefined;

  // Documents
  getDocuments(agentId: number): Document[];
  createDocument(data: InsertDocument): Document;
  updateDocumentStatus(id: number, status: string): Document | undefined;

  // ICA Signature
  getIcaSignature(agentId: number): IcaSignature | undefined;
  createIcaSignature(data: InsertIcaSignature): IcaSignature;

  // Training
  getTrainingProgress(agentId: number): TrainingProgress[];
  upsertTrainingProgress(agentId: number, moduleKey: string): TrainingProgress;
  initTrainingModules(agentId: number): void;
}

export class DatabaseStorage implements IStorage {
  // Agents
  getAgent(id: number) {
    return db.select().from(agents).where(eq(agents.id, id)).get();
  }
  getAgentByEmail(email: string) {
    return db.select().from(agents).where(eq(agents.email, email)).get();
  }
  getAllAgents() {
    return db.select().from(agents).all();
  }
  createAgent(data: InsertAgent) {
    return db.insert(agents).values(data).returning().get();
  }
  updateAgent(id: number, data: Partial<InsertAgent>) {
    return db.update(agents).set(data).where(eq(agents.id, id)).returning().get();
  }

  // Onboarding Tasks
  getOnboardingTasks(agentId: number) {
    return db.select().from(onboardingTasks).where(eq(onboardingTasks.agentId, agentId)).all();
  }
  upsertOnboardingTask(data: InsertOnboardingTask) {
    const existing = db.select().from(onboardingTasks)
      .where(and(eq(onboardingTasks.agentId, data.agentId), eq(onboardingTasks.taskKey, data.taskKey)))
      .get();
    if (existing) {
      return db.update(onboardingTasks).set(data).where(eq(onboardingTasks.id, existing.id)).returning().get()!;
    }
    return db.insert(onboardingTasks).values(data).returning().get();
  }
  updateTaskStatus(agentId: number, taskKey: string, status: string) {
    const task = db.select().from(onboardingTasks)
      .where(and(eq(onboardingTasks.agentId, agentId), eq(onboardingTasks.taskKey, taskKey)))
      .get();
    if (!task) return undefined;
    return db.update(onboardingTasks)
      .set({ status, completedAt: status === "complete" ? new Date().toISOString() : task.completedAt })
      .where(eq(onboardingTasks.id, task.id))
      .returning().get();
  }

  // Documents
  getDocuments(agentId: number) {
    return db.select().from(documents).where(eq(documents.agentId, agentId)).all();
  }
  createDocument(data: InsertDocument) {
    return db.insert(documents).values(data).returning().get();
  }
  updateDocumentStatus(id: number, status: string) {
    return db.update(documents).set({ status }).where(eq(documents.id, id)).returning().get();
  }

  // ICA
  getIcaSignature(agentId: number) {
    return db.select().from(icaSignatures).where(eq(icaSignatures.agentId, agentId)).get();
  }
  createIcaSignature(data: InsertIcaSignature) {
    const existing = this.getIcaSignature(data.agentId);
    if (existing) {
      return db.update(icaSignatures).set(data).where(eq(icaSignatures.agentId, data.agentId)).returning().get()!;
    }
    return db.insert(icaSignatures).values(data).returning().get();
  }

  // Training
  getTrainingProgress(agentId: number) {
    return db.select().from(trainingProgress).where(eq(trainingProgress.agentId, agentId)).all();
  }
  initTrainingModules(agentId: number) {
    const modules = [
      { key: "intro", name: "Welcome to Ocean Luxe" },
      { key: "cold_calling", name: "Cold Calling Mastery" },
      { key: "objections", name: "Handling Objections" },
      { key: "deal_analysis", name: "Deal Analysis & ARV" },
      { key: "crm_walkthrough", name: "CRM Walkthrough" },
    ];
    for (const m of modules) {
      const exists = db.select().from(trainingProgress)
        .where(and(eq(trainingProgress.agentId, agentId), eq(trainingProgress.moduleKey, m.key)))
        .get();
      if (!exists) {
        db.insert(trainingProgress).values({ agentId, moduleKey: m.key, moduleName: m.name }).run();
      }
    }
  }
  upsertTrainingProgress(agentId: number, moduleKey: string) {
    const existing = db.select().from(trainingProgress)
      .where(and(eq(trainingProgress.agentId, agentId), eq(trainingProgress.moduleKey, moduleKey)))
      .get();
    if (existing) {
      return db.update(trainingProgress)
        .set({ completed: true, completedAt: new Date().toISOString() })
        .where(eq(trainingProgress.id, existing.id))
        .returning().get()!;
    }
    return db.insert(trainingProgress).values({ agentId, moduleKey, moduleName: moduleKey, completed: true, completedAt: new Date().toISOString() }).returning().get();
  }
}

export const storage = new DatabaseStorage();
