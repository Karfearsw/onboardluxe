import type { Express } from "express";
import { createServer, type Server } from "http";
import { getSharedAuthDiagnostics, requireSharedAdmin, requireSharedAuth } from "./auth.js";
import { clearAgentSessionCookie, createAgentSession, deleteAgentSession, requireAgentAuth, requireAgentOrAdmin, setAgentSessionCookie } from "./agent-auth.js";
import { pool } from "./db.js";
import { sendDiscordWebhook } from "./discord.js";
import { listStatusEvents, logStatusEvent } from "./status-events.js";
import { storage } from "./storage.js";
import { insertAgentSchema, insertIcaSignatureSchema } from "../shared/schema.js";
import { PIPELINE_STAGES, normalizePipelineStage } from "../shared/status.js";
import { z } from "zod";

const debugEndpointsEnabled = process.env.DEBUG_ENDPOINTS === "1" || process.env.NODE_ENV !== "production";

const agentUpdateSchema = insertAgentSchema.partial();
const onboardingStatusSchema = z.object({
  status: z.enum(["pending", "in_progress", "complete"]),
});
const documentStatusSchema = z.object({
  status: z.enum(["Pending Review", "Approved", "Rejected"]),
});
const payoutSchema = z.object({
  payoutMethodType: z.enum(["SoFi", "PayPal", "Bank Transfer", "Zelle"]),
  payoutDetails: z.string().trim().min(1),
  sofiReferralStatus: z.enum(["Not Invited", "Invited", "Opened", "Bonus Confirmed", "Declined"]).optional(),
  sofiReferralLink: z.string().trim().optional(),
});
const pipelineStageSchema = z.enum(PIPELINE_STAGES);
const pipelineStageUpdateSchema = z.object({ stage: pipelineStageSchema });

function validatePayoutDetails(payoutMethodType: string, payoutDetails: string) {
  const value = payoutDetails.trim();

  if (payoutMethodType === "SoFi") {
    const ok = z.string().email().safeParse(value).success;
    if (!ok) return "Enter a valid SoFi account email.";
    return null;
  }

  if (payoutMethodType === "Bank Transfer") {
    if (/\d{5,}/.test(value)) {
      return "For security, enter bank name and last 4 digits only (no full account/routing numbers).";
    }
    if (!/\b\d{4}\b/.test(value)) {
      return "Enter last 4 digits (e.g. 4521).";
    }
    return null;
  }

  if (payoutMethodType === "PayPal") {
    if (!value) return "Enter a PayPal email or username.";
    return null;
  }

  if (payoutMethodType === "Zelle") {
    const emailOk = z.string().email().safeParse(value).success;
    const phoneOk = /^\+?[0-9()\-.\s]{7,}$/.test(value);
    if (!emailOk && !phoneOk) return "Enter a valid Zelle phone number or email.";
    return null;
  }

  return "Invalid payout method.";
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  async function buildStatusSummary(agentId: number) {
    const agent = await storage.getAgent(agentId);
    if (!agent) return null;

    const [tasks, docs, training, events] = await Promise.all([
      storage.getOnboardingTasks(agentId),
      storage.getDocuments(agentId),
      storage.getTrainingProgress(agentId),
      listStatusEvents(agentId, 12),
    ]);

    const completedTasks = tasks.filter((t) => t.status === "complete").length;
    const progressPercent = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
    const currentTask = tasks.find((t) => t.status === "in_progress") || tasks.find((t) => t.status === "pending") || null;
    const pendingDocs = docs.filter((d) => d.status === "Pending Review").length;
    const completedTrainingModules = training.filter((t) => t.completed).length;
    const trainingTotal = training.length;
    const payoutTask = tasks.find((t) => t.taskKey === "payout");
    const payoutSubmitted = payoutTask?.status === "complete";

    return {
      agentId: agent.id,
      pipelineStage: normalizePipelineStage(agent.crmPipelineStage),
      subscriptionStatus: agent.subscriptionStatus,
      onboarding: {
        step: agent.onboardingStep,
        complete: agent.onboardingComplete,
        progressPercent,
        currentTask,
      },
      documents: {
        pendingReview: pendingDocs,
      },
      training: {
        completed: completedTrainingModules,
        total: trainingTotal,
      },
      payout: {
        submitted: payoutSubmitted,
        payoutMethodType: agent.payoutMethodType,
      },
      events,
    };
  }

  if (debugEndpointsEnabled) {
    app.get("/api/health", async (_req, res) => {
      try {
        await pool.query("select 1 as ok");
        res.json({ ok: true });
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        res.status(500).json({ ok: false, message: error.message });
      }
    });

    app.post("/api/debug/discord", async (req, res) => {
      if (!process.env.DISCORD_WEBHOOK_URL?.trim()) {
        return res.status(400).json({ ok: false, message: "DISCORD_WEBHOOK_URL not set" });
      }

      try {
        await sendDiscordWebhook("debug.discord_test", {
          timestamp: new Date().toISOString(),
          ip: req.ip,
          body: req.body ?? null,
        });
        return res.json({ ok: true });
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        return res.status(500).json({ ok: false, message: error.message });
      }
    });

    app.get("/api/debug/auth", async (req, res) => {
      let dbOk = true;
      try {
        await pool.query("select 1 as ok");
      } catch {
        dbOk = false;
      }

      const diagnostics = await getSharedAuthDiagnostics(req);
      res.json({ dbOk, ...diagnostics });
    });
  }

  app.get("/api/admin/auth/diagnostics", async (req, res) => {
    let dbOk = true;
    try {
      await pool.query("select 1 as ok");
    } catch {
      dbOk = false;
    }

    const diagnostics = await getSharedAuthDiagnostics(req);
    res.json({
      dbOk,
      debugEndpointsEnabled,
      message: debugEndpointsEnabled ? "" : "Enable DEBUG_ENDPOINTS=1 to access deeper diagnostics at /api/debug/auth",
      diagnostics,
    });
  });

  app.post("/api/agent/login", async (req, res) => {
    const schema = z.object({ email: z.string().email(), phoneLast4: z.string().trim().regex(/^\d{4}$/) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid login payload", issues: parsed.error.issues });
    }

    const agent = await storage.getAgentByEmail(parsed.data.email.toLowerCase());
    if (!agent) return res.status(401).json({ message: "Invalid credentials" });

    const digits = String(agent.phone || "").replace(/\D/g, "");
    const last4 = digits.slice(-4);
    if (!last4 || last4 !== parsed.data.phoneLast4) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const session = await createAgentSession(agent.id);
    setAgentSessionCookie(res, session.token);
    return res.json({ ok: true, agentId: agent.id });
  });

  app.post("/api/agent/logout", requireAgentAuth, async (req, res) => {
    const token = req.agentUser?.sessionToken;
    if (token) {
      await deleteAgentSession(token);
    }
    clearAgentSessionCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/agent/me", requireAgentAuth, async (req, res) => {
    const agentId = req.agentUser!.agentId;
    const [agent, tasks] = await Promise.all([
      storage.getAgent(agentId),
      storage.getOnboardingTasks(agentId),
    ]);

    if (!agent) return res.status(404).json({ message: "Agent not found" });
    res.json({ agent, tasks });
  });

  app.get("/api/agent/status", requireAgentAuth, async (req, res) => {
    const agentId = req.agentUser!.agentId;
    const summary = await buildStatusSummary(agentId);
    if (!summary) return res.status(404).json({ message: "Agent not found" });
    res.json(summary);
  });

  // ── Agents ────────────────────────────────────────────────────────────────
  app.get("/api/agents", requireSharedAdmin, async (_req, res) => {
    const all = await storage.getAllAgents();
    res.json(all);
  });

  app.get("/api/agents/:id", requireAgentOrAdmin("id"), async (req, res) => {
    const agent = await storage.getAgent(Number(req.params.id));
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    res.json(agent);
  });

  app.post("/api/agents", async (req, res) => {
    try {
      const data = insertAgentSchema.parse({
        ...req.body,
        startDate: new Date().toISOString(),
        subscriptionStatus: "Trial",
        crmPipelineStage: "Applicant",
        onboardingStep: 1,
        onboardingComplete: false,
      });
      const agent = await storage.createAgent(data);
      // Seed onboarding tasks
      const steps = [
        { stepNumber: 1, taskKey: "profile" },
        { stepNumber: 2, taskKey: "ica" },
        { stepNumber: 3, taskKey: "w9" },
        { stepNumber: 4, taskKey: "id_upload" },
        { stepNumber: 5, taskKey: "payout" },
        { stepNumber: 6, taskKey: "training" },
      ];
      for (const s of steps) {
        await storage.upsertOnboardingTask({ agentId: agent.id, ...s, status: "pending" });
      }
      // Mark first step in progress
      await storage.updateTaskStatus(agent.id, "profile", "in_progress");
      await storage.initTrainingModules(agent.id);
      const session = await createAgentSession(agent.id);
      setAgentSessionCookie(res, session.token);
      await logStatusEvent({
        agentId: agent.id,
        eventType: "agent.created",
        actorType: "system",
        metadata: { email: agent.email, name: agent.name },
      });
      void sendDiscordWebhook("agent.created", { agent }).catch((error) => {
        console.error("Discord webhook failed (agent.created):", error);
      });
      res.status(201).json(agent);
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid registration payload", issues: e.issues });
      }

      const error = e instanceof Error ? e : new Error(String(e));
      const code = (e as { code?: unknown } | null)?.code;

      if (code === "23505") {
        return res.status(409).json({ message: "An agent with this email already exists." });
      }

      console.error("Agent registration failed:", error);
      return res.status(500).json({ message: error.message || "Internal Server Error" });
    }
  });

  app.patch("/api/agents/:id", requireSharedAdmin, async (req, res) => {
    let payload;
    try {
      payload = agentUpdateSchema.parse(req.body);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }

    const agentId = Number(req.params.id);
    const previous = await storage.getAgent(agentId);
    const agent = await storage.updateAgent(agentId, payload);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    if (previous && typeof payload.subscriptionStatus === "string" && payload.subscriptionStatus !== previous.subscriptionStatus) {
      await logStatusEvent({
        agentId: agent.id,
        eventType: "subscription.status_changed",
        actorType: "admin",
        actorId: String(req.authUser?.id ?? ""),
        oldValue: previous.subscriptionStatus,
        newValue: payload.subscriptionStatus,
      });
    }
    res.json(agent);
  });

  // ── Admin ─────────────────────────────────────────────────────────────────
  app.get("/api/admin/me", requireSharedAuth, async (req, res) => {
    res.json(req.authUser);
  });

  app.get("/api/admin/agents/:id", requireSharedAdmin, async (req, res) => {
    const agentId = Number(req.params.id);
    const [agent, tasks, docs, ica, training] = await Promise.all([
      storage.getAgent(agentId),
      storage.getOnboardingTasks(agentId),
      storage.getDocuments(agentId),
      storage.getIcaSignature(agentId),
      storage.getTrainingProgress(agentId),
    ]);

    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const completedTasks = tasks.filter((task) => task.status === "complete").length;
    const pendingDocs = docs.filter((doc) => doc.status === "Pending Review").length;

    res.json({
      agent,
      tasks,
      documents: docs,
      ica,
      training,
      metrics: {
        progressPercent: Math.round((completedTasks / 6) * 100),
        completedTasks,
        pendingDocs,
        completedTrainingModules: training.filter((module) => module.completed).length,
      },
    });
  });

  app.get("/api/admin/agents/:id/status", requireSharedAdmin, async (req, res) => {
    const agentId = Number(req.params.id);
    const summary = await buildStatusSummary(agentId);
    if (!summary) return res.status(404).json({ message: "Agent not found" });
    res.json(summary);
  });

  app.patch("/api/admin/agents/:id/pipeline-stage", requireSharedAdmin, async (req, res) => {
    const parsed = pipelineStageUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid stage payload", issues: parsed.error.issues });
    }

    const agentId = Number(req.params.id);
    const agent = await storage.getAgent(agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const previousStage = normalizePipelineStage(agent.crmPipelineStage);
    const nextStage = parsed.data.stage;
    if (previousStage === nextStage) return res.json({ ok: true, stage: nextStage });

    const updated = await storage.updateAgent(agentId, { crmPipelineStage: nextStage });
    if (!updated) return res.status(404).json({ message: "Agent not found" });

    await logStatusEvent({
      agentId,
      eventType: "pipeline.stage_changed",
      actorType: "admin",
      actorId: String(req.authUser?.id ?? ""),
      oldValue: previousStage,
      newValue: nextStage,
    });

    void sendDiscordWebhook("agent.pipeline_stage_changed", { agentId, previousStage, nextStage }).catch((error) => {
      console.error("Discord webhook failed (agent.pipeline_stage_changed):", error);
    });

    res.json({ ok: true, stage: nextStage });
  });

  app.patch("/api/admin/documents/:id", requireSharedAdmin, async (req, res) => {
    try {
      const existing = await storage.getDocument(Number(req.params.id));
      const { status } = documentStatusSchema.parse(req.body);
      const document = await storage.updateDocumentStatus(Number(req.params.id), status);
      if (!document) return res.status(404).json({ message: "Document not found" });
      await logStatusEvent({
        agentId: document.agentId,
        eventType: "document.status_changed",
        actorType: "admin",
        actorId: String(req.authUser?.id ?? ""),
        oldValue: existing?.status || "",
        newValue: status,
        metadata: { docType: document.docType, documentId: document.id },
      });
      res.json(document);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── Onboarding ────────────────────────────────────────────────────────────
  app.get("/api/agents/:id/onboarding", requireAgentOrAdmin("id"), async (req, res) => {
    const tasks = await storage.getOnboardingTasks(Number(String(req.params.id)));
    res.json(tasks);
  });

  app.patch("/api/agents/:id/onboarding/:taskKey", requireAgentOrAdmin("id"), async (req, res) => {
    const { status } = onboardingStatusSchema.parse(req.body);
    const task = await storage.updateTaskStatus(Number(String(req.params.id)), String(req.params.taskKey), status);
    if (!task) return res.status(404).json({ message: "Task not found" });

    // Auto-advance agent's onboarding step
    if (status === "complete") {
      const tasks = await storage.getOnboardingTasks(Number(String(req.params.id)));
      const nextPending = tasks.find((t) => t.status === "pending");
      const allComplete = tasks.every((t) => t.status === "complete");

      await logStatusEvent({
        agentId: Number(String(req.params.id)),
        eventType: "onboarding.task_completed",
        actorType: req.authUser ? "admin" : "agent",
        actorId: String(req.authUser?.id ?? ""),
        metadata: { taskKey: String(req.params.taskKey) },
      });

      if (nextPending) {
        await storage.updateTaskStatus(Number(String(req.params.id)), nextPending.taskKey, "in_progress");
        await storage.updateAgent(Number(String(req.params.id)), { onboardingStep: nextPending.stepNumber });
      }
      if (allComplete) {
        await storage.updateAgent(Number(String(req.params.id)), { onboardingComplete: true, onboardingStep: 6 });
        await logStatusEvent({
          agentId: Number(String(req.params.id)),
          eventType: "onboarding.completed",
          actorType: "system",
        });
        void sendDiscordWebhook("onboarding.completed", { agentId: Number(String(req.params.id)) }).catch((error) => {
          console.error("Discord webhook failed (onboarding.completed):", error);
        });
      }
    }
    res.json(task);
  });

  // ── ICA Signature ─────────────────────────────────────────────────────────
  app.get("/api/agents/:id/ica", requireAgentOrAdmin("id"), async (req, res) => {
    const sig = await storage.getIcaSignature(Number(String(req.params.id)));
    res.json(sig || null);
  });

  app.post("/api/agents/:id/ica", requireAgentOrAdmin("id"), async (req, res) => {
    try {
      const data = insertIcaSignatureSchema.parse({
        ...req.body,
        agentId: Number(String(req.params.id)),
        signedAt: new Date().toISOString(),
      });
      const sig = await storage.createIcaSignature(data);
      // Mark ICA task complete
      await storage.updateTaskStatus(Number(String(req.params.id)), "ica", "complete");
      await logStatusEvent({
        agentId: Number(String(req.params.id)),
        eventType: "ica.signed",
        actorType: req.authUser ? "admin" : "agent",
        actorId: String(req.authUser?.id ?? ""),
      });
      void sendDiscordWebhook("agent.ica_signed", { agentId: Number(String(req.params.id)), signature: sig }).catch((error) => {
        console.error("Discord webhook failed (agent.ica_signed):", error);
      });
      res.status(201).json(sig);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── Documents ─────────────────────────────────────────────────────────────
  app.get("/api/agents/:id/documents", requireAgentOrAdmin("id"), async (req, res) => {
    const docs = await storage.getDocuments(Number(String(req.params.id)));
    res.json(docs);
  });

  app.post("/api/agents/:id/documents", requireAgentOrAdmin("id"), async (req, res) => {
    try {
      const { docType, fileName, fileUrl } = req.body;
      const doc = await storage.createDocument({
        agentId: Number(String(req.params.id)),
        docType,
        fileName,
        fileUrl: fileUrl || `/uploads/${fileName}`,
        uploadedAt: new Date().toISOString(),
        status: "Pending Review",
      });
      // Mark corresponding task complete
      const taskKeyMap: Record<string, string> = { W9: "w9", ID: "id_upload" };
      if (taskKeyMap[docType]) {
        await storage.updateTaskStatus(Number(String(req.params.id)), taskKeyMap[docType], "complete");
      }
      await logStatusEvent({
        agentId: Number(String(req.params.id)),
        eventType: "document.uploaded",
        actorType: req.authUser ? "admin" : "agent",
        actorId: String(req.authUser?.id ?? ""),
        metadata: { docType: String(docType), documentId: doc.id },
      });
      void sendDiscordWebhook("agent.document_added", { agentId: Number(String(req.params.id)), document: doc }).catch((error) => {
        console.error("Discord webhook failed (agent.document_added):", error);
      });
      res.status(201).json(doc);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── Payout Setup ──────────────────────────────────────────────────────────
  app.post("/api/agents/:id/payout", requireAgentOrAdmin("id"), async (req, res) => {
    const parsed = payoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid payout payload", issues: parsed.error.issues });
    }

    const {
      payoutMethodType,
      payoutDetails,
      sofiReferralStatus: rawSofiReferralStatus,
      sofiReferralLink: rawSofiReferralLink,
    } = parsed.data;

    const validationError = validatePayoutDetails(payoutMethodType, payoutDetails);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const envLink = process.env.SOFI_REFERRAL_LINK?.trim() ?? "";
    const sofiReferralStatus = rawSofiReferralStatus || "Not Invited";
    const shouldAttachLink = ["Invited", "Opened", "Bonus Confirmed"].includes(sofiReferralStatus);
    const sofiReferralLink = (rawSofiReferralLink?.trim() || (shouldAttachLink ? envLink : "")).trim();

    const agent = await storage.updateAgent(Number(String(req.params.id)), {
      payoutMethodType,
      payoutDetails,
      sofiReferralStatus,
      sofiReferralLink,
    });
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    await storage.updateTaskStatus(Number(String(req.params.id)), "payout", "complete");
    await logStatusEvent({
      agentId: Number(String(req.params.id)),
      eventType: "payout.submitted",
      actorType: req.authUser ? "admin" : "agent",
      actorId: String(req.authUser?.id ?? ""),
      metadata: { payoutMethodType },
    });
    void sendDiscordWebhook("agent.payout_submitted", { agent }).catch((error) => {
      console.error("Discord webhook failed (agent.payout_submitted):", error);
    });
    res.json(agent);
  });

  app.post("/api/agents/:id/sofi/opened", requireAgentOrAdmin("id"), async (req, res) => {
    const envLink = process.env.SOFI_REFERRAL_LINK?.trim() ?? "";
    const agent = await storage.updateAgent(Number(String(req.params.id)), {
      sofiReferralStatus: "Opened",
      sofiReferralLink: envLink,
    });
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    await logStatusEvent({
      agentId: Number(String(req.params.id)),
      eventType: "sofi.referral_opened",
      actorType: req.authUser ? "admin" : "agent",
      actorId: String(req.authUser?.id ?? ""),
    });
    res.json(agent);
  });

  // ── Training ──────────────────────────────────────────────────────────────
  app.get("/api/agents/:id/training", requireAgentOrAdmin("id"), async (req, res) => {
    const progress = await storage.getTrainingProgress(Number(String(req.params.id)));
    res.json(progress);
  });

  app.post("/api/agents/:id/training/:moduleKey/complete", requireAgentOrAdmin("id"), async (req, res) => {
    const progress = await storage.upsertTrainingProgress(Number(String(req.params.id)), String(req.params.moduleKey));
    // Check if all training modules done
    const all = await storage.getTrainingProgress(Number(String(req.params.id)));
    if (all.length > 0 && all.every((m) => m.completed)) {
      await storage.updateTaskStatus(Number(String(req.params.id)), "training", "complete");
    }
    await logStatusEvent({
      agentId: Number(String(req.params.id)),
      eventType: "training.module_completed",
      actorType: req.authUser ? "admin" : "agent",
      actorId: String(req.authUser?.id ?? ""),
      metadata: { moduleKey: String(req.params.moduleKey) },
    });

    const tasks = await storage.getOnboardingTasks(Number(String(req.params.id)));
    const allComplete = tasks.every((t) => t.status === "complete");
    if (allComplete) {
      const agent = await storage.getAgent(Number(String(req.params.id)));
      if (agent && !agent.onboardingComplete) {
        await storage.updateAgent(Number(String(req.params.id)), { onboardingComplete: true, onboardingStep: 6 });
        await logStatusEvent({
          agentId: Number(String(req.params.id)),
          eventType: "onboarding.completed",
          actorType: "system",
        });
        void sendDiscordWebhook("onboarding.completed", { agentId: Number(String(req.params.id)) }).catch((error) => {
          console.error("Discord webhook failed (onboarding.completed):", error);
        });
      }
    }
    void sendDiscordWebhook("agent.training_completed", { agentId: Number(String(req.params.id)), moduleKey: String(req.params.moduleKey), progress }).catch((error) => {
      console.error("Discord webhook failed (agent.training_completed):", error);
    });
    res.json(progress);
  });

  // ── Stats (Admin summary) ─────────────────────────────────────────────────
  app.get("/api/stats", requireSharedAdmin, async (_req, res) => {
    const all = await storage.getAllAgents();
    const active = all.filter((a) => a.subscriptionStatus === "Active").length;
    const trial = all.filter((a) => a.subscriptionStatus === "Trial").length;
    const paused = all.filter((a) => a.subscriptionStatus === "Paused").length;
    const cancelled = all.filter((a) => a.subscriptionStatus === "Cancelled").length;
    const complete = all.filter((a) => a.onboardingComplete).length;
    const inProgress = all.filter((a) => !a.onboardingComplete).length;
    const documentSets = await Promise.all(all.map((agent) => storage.getDocuments(agent.id)));
    const pendingDocs = documentSets.flat().filter((doc) => doc.status === "Pending Review").length;
    const mrr = active * 50;
    const goal = 5000;
    res.json({
      total: all.length,
      active,
      trial,
      paused,
      cancelled,
      complete,
      inProgress,
      pendingDocs,
      mrr,
      goal,
      mrrPercent: Math.round((mrr / goal) * 100),
    });
  });

  return httpServer;
}
