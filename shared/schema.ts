import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Agents ──────────────────────────────────────────────────────────────────
export const agents = sqliteTable("agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  startDate: text("start_date").notNull(),
  subscriptionStatus: text("subscription_status").notNull().default("Trial"), // Trial | Active | Paused | Cancelled
  payoutMethodType: text("payout_method_type").default(""), // SoFi | PayPal | Bank | Zelle
  payoutDetails: text("payout_details").default(""),
  sofiReferralStatus: text("sofi_referral_status").notNull().default("Not Invited"), // Not Invited | Invited | Opened | Bonus Confirmed | Declined
  sofiReferralLink: text("sofi_referral_link").default(""),
  performanceNotes: text("performance_notes").default(""),
  onboardingStep: integer("onboarding_step").notNull().default(1), // 1-6
  onboardingComplete: integer("onboarding_complete", { mode: "boolean" }).notNull().default(false),
});

export const insertAgentSchema = createInsertSchema(agents).omit({ id: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;

// ─── Onboarding Checklist Items ───────────────────────────────────────────────
export const onboardingTasks = sqliteTable("onboarding_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id").notNull(),
  stepNumber: integer("step_number").notNull(), // 1-6
  taskKey: text("task_key").notNull(), // 'profile' | 'ica' | 'w9' | 'id_upload' | 'payout' | 'training'
  status: text("status").notNull().default("pending"), // pending | in_progress | complete
  completedAt: text("completed_at").default(""),
  notes: text("notes").default(""),
});

export const insertOnboardingTaskSchema = createInsertSchema(onboardingTasks).omit({ id: true });
export type InsertOnboardingTask = z.infer<typeof insertOnboardingTaskSchema>;
export type OnboardingTask = typeof onboardingTasks.$inferSelect;

// ─── Documents ────────────────────────────────────────────────────────────────
export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id").notNull(),
  docType: text("doc_type").notNull(), // 'ICA' | 'W9' | 'ID' | 'Direct_Deposit'
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  status: text("status").notNull().default("Pending Review"), // Pending Review | Approved | Rejected
});

export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// ─── ICA Signature Data ───────────────────────────────────────────────────────
export const icaSignatures = sqliteTable("ica_signatures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id").notNull().unique(),
  legalName: text("legal_name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  signatureDataUrl: text("signature_data_url").notNull(), // base64 canvas signature
  signedAt: text("signed_at").notNull(),
  ipAddress: text("ip_address").default(""),
  agreed: integer("agreed", { mode: "boolean" }).notNull().default(false),
});

export const insertIcaSignatureSchema = createInsertSchema(icaSignatures).omit({ id: true });
export type InsertIcaSignature = z.infer<typeof insertIcaSignatureSchema>;
export type IcaSignature = typeof icaSignatures.$inferSelect;

// ─── Training Progress ────────────────────────────────────────────────────────
export const trainingProgress = sqliteTable("training_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id").notNull(),
  moduleKey: text("module_key").notNull(), // 'intro' | 'cold_calling' | 'objections' | 'deal_analysis' | 'crm_walkthrough'
  moduleName: text("module_name").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  completedAt: text("completed_at").default(""),
});

export const insertTrainingProgressSchema = createInsertSchema(trainingProgress).omit({ id: true });
export type InsertTrainingProgress = z.infer<typeof insertTrainingProgressSchema>;
export type TrainingProgress = typeof trainingProgress.$inferSelect;
