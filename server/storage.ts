import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { agents, onboardingTasks, documents, icaSignatures, trainingProgress } from "@shared/schema";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
export const db = drizzle(sqlite);
import type {
  Agent, InsertAgent,
  OnboardingTask, InsertOnboardingTask,
  Document, InsertDocument,
  IcaSignature, InsertIcaSignature,
  TrainingProgress, InsertTrainingProgress,
} from "@shared/schema";
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
