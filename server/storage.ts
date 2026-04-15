import { and, asc, eq } from "drizzle-orm";
import { db, ensureDatabase } from "./db.js";
import { agents, onboardingTasks, documents, icaSignatures, trainingProgress } from "../shared/schema.js";
import type {
  Agent, InsertAgent,
  OnboardingTask, InsertOnboardingTask,
  Document, InsertDocument,
  IcaSignature, InsertIcaSignature,
  TrainingProgress, InsertTrainingProgress,
} from "../shared/schema.js";

export interface IStorage {
  // Agents
  getAgent(id: number): Promise<Agent | undefined>;
  getAgentByEmail(email: string): Promise<Agent | undefined>;
  getAllAgents(): Promise<Agent[]>;
  createAgent(data: InsertAgent): Promise<Agent>;
  updateAgent(id: number, data: Partial<InsertAgent>): Promise<Agent | undefined>;

  // Onboarding Tasks
  getOnboardingTasks(agentId: number): Promise<OnboardingTask[]>;
  upsertOnboardingTask(data: InsertOnboardingTask): Promise<OnboardingTask>;
  updateTaskStatus(agentId: number, taskKey: string, status: string): Promise<OnboardingTask | undefined>;

  // Documents
  getDocuments(agentId: number): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  createDocument(data: InsertDocument): Promise<Document>;
  updateDocumentStatus(id: number, status: string): Promise<Document | undefined>;

  // ICA Signature
  getIcaSignature(agentId: number): Promise<IcaSignature | undefined>;
  createIcaSignature(data: InsertIcaSignature): Promise<IcaSignature>;

  // Training
  getTrainingProgress(agentId: number): Promise<TrainingProgress[]>;
  upsertTrainingProgress(agentId: number, moduleKey: string): Promise<TrainingProgress>;
  initTrainingModules(agentId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Agents
  async getAgent(id: number) {
    await ensureDatabase();
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    return agent;
  }
  async getAgentByEmail(email: string) {
    await ensureDatabase();
    const [agent] = await db.select().from(agents).where(eq(agents.email, email));
    return agent;
  }
  async getAllAgents() {
    await ensureDatabase();
    return db.select().from(agents).orderBy(asc(agents.id));
  }
  async createAgent(data: InsertAgent) {
    await ensureDatabase();
    const [agent] = await db.insert(agents).values(data).returning();
    return agent;
  }
  async updateAgent(id: number, data: Partial<InsertAgent>) {
    await ensureDatabase();
    const [agent] = await db.update(agents).set(data).where(eq(agents.id, id)).returning();
    return agent;
  }

  // Onboarding Tasks
  async getOnboardingTasks(agentId: number) {
    await ensureDatabase();
    return db
      .select()
      .from(onboardingTasks)
      .where(eq(onboardingTasks.agentId, agentId))
      .orderBy(asc(onboardingTasks.stepNumber));
  }
  async upsertOnboardingTask(data: InsertOnboardingTask) {
    await ensureDatabase();
    const [existing] = await db
      .select()
      .from(onboardingTasks)
      .where(and(eq(onboardingTasks.agentId, data.agentId), eq(onboardingTasks.taskKey, data.taskKey)));
    if (existing) {
      const [task] = await db.update(onboardingTasks).set(data).where(eq(onboardingTasks.id, existing.id)).returning();
      return task;
    }
    const [task] = await db.insert(onboardingTasks).values(data).returning();
    return task;
  }
  async updateTaskStatus(agentId: number, taskKey: string, status: string) {
    await ensureDatabase();
    const [task] = await db
      .select()
      .from(onboardingTasks)
      .where(and(eq(onboardingTasks.agentId, agentId), eq(onboardingTasks.taskKey, taskKey)));
    if (!task) return undefined;
    const [updatedTask] = await db.update(onboardingTasks)
      .set({ status, completedAt: status === "complete" ? new Date().toISOString() : task.completedAt })
      .where(eq(onboardingTasks.id, task.id))
      .returning();
    return updatedTask;
  }

  // Documents
  async getDocuments(agentId: number) {
    await ensureDatabase();
    return db.select().from(documents).where(eq(documents.agentId, agentId)).orderBy(asc(documents.id));
  }
  async getDocument(id: number) {
    await ensureDatabase();
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document;
  }
  async createDocument(data: InsertDocument) {
    await ensureDatabase();
    const [document] = await db.insert(documents).values(data).returning();
    return document;
  }
  async updateDocumentStatus(id: number, status: string) {
    await ensureDatabase();
    const [document] = await db.update(documents).set({ status }).where(eq(documents.id, id)).returning();
    return document;
  }

  // ICA
  async getIcaSignature(agentId: number) {
    await ensureDatabase();
    const [signature] = await db.select().from(icaSignatures).where(eq(icaSignatures.agentId, agentId));
    return signature;
  }
  async createIcaSignature(data: InsertIcaSignature) {
    await ensureDatabase();
    const existing = await this.getIcaSignature(data.agentId);
    if (existing) {
      const [signature] = await db.update(icaSignatures).set(data).where(eq(icaSignatures.agentId, data.agentId)).returning();
      return signature;
    }
    const [signature] = await db.insert(icaSignatures).values(data).returning();
    return signature;
  }

  // Training
  async getTrainingProgress(agentId: number) {
    await ensureDatabase();
    return db.select().from(trainingProgress).where(eq(trainingProgress.agentId, agentId)).orderBy(asc(trainingProgress.id));
  }
  async initTrainingModules(agentId: number) {
    await ensureDatabase();
    const modules = [
      { key: "intro", name: "Welcome to Ocean Luxe" },
      { key: "cold_calling", name: "Cold Calling Mastery" },
      { key: "objections", name: "Handling Objections" },
      { key: "deal_analysis", name: "Deal Analysis & ARV" },
      { key: "crm_walkthrough", name: "CRM Walkthrough" },
    ];
    for (const m of modules) {
      const [exists] = await db
        .select()
        .from(trainingProgress)
        .where(and(eq(trainingProgress.agentId, agentId), eq(trainingProgress.moduleKey, m.key)));
      if (!exists) {
        await db.insert(trainingProgress).values({ agentId, moduleKey: m.key, moduleName: m.name });
      }
    }
  }
  async upsertTrainingProgress(agentId: number, moduleKey: string) {
    await ensureDatabase();
    const [existing] = await db
      .select()
      .from(trainingProgress)
      .where(and(eq(trainingProgress.agentId, agentId), eq(trainingProgress.moduleKey, moduleKey)));
    if (existing) {
      const [progress] = await db.update(trainingProgress)
        .set({ completed: true, completedAt: new Date().toISOString() })
        .where(eq(trainingProgress.id, existing.id))
        .returning();
      return progress;
    }
    const [progress] = await db
      .insert(trainingProgress)
      .values({ agentId, moduleKey, moduleName: moduleKey, completed: true, completedAt: new Date().toISOString() })
      .returning();
    return progress;
  }
}

export const storage = new DatabaseStorage();
