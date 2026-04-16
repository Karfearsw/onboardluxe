import type { Express } from "express";
import { createServer, type Server } from "http";
import { requireSharedAdmin, requireSharedAuth } from "./auth.js";
import { pool } from "./db.js";
import { sendDiscordWebhook } from "./discord.js";
import { storage } from "./storage.js";
import { insertAgentSchema, insertIcaSignatureSchema } from "../shared/schema.js";
import { z } from "zod";

const DEFAULT_COOKIE_NAMES = [
  "connect.sid",
  "__Secure-better-auth.session_token",
  "better-auth.session_token",
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
  "session",
];

const debugEndpointsEnabled = process.env.DEBUG_ENDPOINTS === "1" || process.env.NODE_ENV !== "production";

const agentUpdateSchema = insertAgentSchema.partial();
const onboardingStatusSchema = z.object({
  status: z.enum(["pending", "in_progress", "complete"]),
});
const documentStatusSchema = z.object({
  status: z.enum(["Pending Review", "Approved", "Rejected"]),
});

function parseCookies(cookieHeader?: string) {
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
  }

  return cookies;
}

function getConfiguredCookieNames() {
  const configured = process.env.AUTH_COOKIE_NAMES?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return configured?.length ? configured : DEFAULT_COOKIE_NAMES;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
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
      const cookies = parseCookies(req.headers.cookie);
      const cookieNames = getConfiguredCookieNames();
      const matchedCookieName = cookieNames.find((name) => cookies.has(name)) ?? null;


      let dbOk = true;
      try {
        await pool.query("select 1 as ok");
      } catch {
        dbOk = false;
      }

      const authUser = req.authUser ?? null;

      res.json({
        dbOk,
        hasSessionCookie: Boolean(matchedCookieName),
        matchedCookieName,
        hasAuthUser: Boolean(authUser),
        authUser: authUser
          ? {
              id: authUser.id,
              email: authUser.email,
              name: authUser.name,
              role: authUser.role,
              organizationId: authUser.organizationId,
              organizationSlug: authUser.organizationSlug,
              organizationRole: authUser.organizationRole,
            }
          : null,
      });
    });
  }

  // ── Agents ────────────────────────────────────────────────────────────────
  app.get("/api/agents", requireSharedAdmin, async (_req, res) => {
    const all = await storage.getAllAgents();
    res.json(all);
  });

  app.get("/api/agents/:id", async (req, res) => {
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
      void sendDiscordWebhook("agent.created", { agent });
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

    const agent = await storage.updateAgent(Number(req.params.id), payload);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
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

  app.patch("/api/admin/documents/:id", requireSharedAdmin, async (req, res) => {
    try {
      const { status } = documentStatusSchema.parse(req.body);
      const document = await storage.updateDocumentStatus(Number(req.params.id), status);
      if (!document) return res.status(404).json({ message: "Document not found" });
      res.json(document);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── Onboarding ────────────────────────────────────────────────────────────
  app.get("/api/agents/:id/onboarding", async (req, res) => {
    const tasks = await storage.getOnboardingTasks(Number(req.params.id));
    res.json(tasks);
  });

  app.patch("/api/agents/:id/onboarding/:taskKey", async (req, res) => {
    const { status } = onboardingStatusSchema.parse(req.body);
    const task = await storage.updateTaskStatus(Number(req.params.id), req.params.taskKey, status);
    if (!task) return res.status(404).json({ message: "Task not found" });

    // Auto-advance agent's onboarding step
    if (status === "complete") {
      const tasks = await storage.getOnboardingTasks(Number(req.params.id));
      const nextPending = tasks.find((t) => t.status === "pending");
      const allComplete = tasks.every((t) => t.status === "complete");

      if (nextPending) {
        await storage.updateTaskStatus(Number(req.params.id), nextPending.taskKey, "in_progress");
        await storage.updateAgent(Number(req.params.id), { onboardingStep: nextPending.stepNumber });
      }
      if (allComplete) {
        await storage.updateAgent(Number(req.params.id), { onboardingComplete: true, onboardingStep: 6 });
      }
    }
    res.json(task);
  });

  // ── ICA Signature ─────────────────────────────────────────────────────────
  app.get("/api/agents/:id/ica", async (req, res) => {
    const sig = await storage.getIcaSignature(Number(req.params.id));
    res.json(sig || null);
  });

  app.post("/api/agents/:id/ica", async (req, res) => {
    try {
      const data = insertIcaSignatureSchema.parse({
        ...req.body,
        agentId: Number(req.params.id),
        signedAt: new Date().toISOString(),
      });
      const sig = await storage.createIcaSignature(data);
      // Mark ICA task complete
      await storage.updateTaskStatus(Number(req.params.id), "ica", "complete");
      void sendDiscordWebhook("agent.ica_signed", { agentId: Number(req.params.id), signature: sig });
      res.status(201).json(sig);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── Documents ─────────────────────────────────────────────────────────────
  app.get("/api/agents/:id/documents", async (req, res) => {
    const docs = await storage.getDocuments(Number(req.params.id));
    res.json(docs);
  });

  app.post("/api/agents/:id/documents", async (req, res) => {
    try {
      const { docType, fileName, fileUrl } = req.body;
      const doc = await storage.createDocument({
        agentId: Number(req.params.id),
        docType,
        fileName,
        fileUrl: fileUrl || `/uploads/${fileName}`,
        uploadedAt: new Date().toISOString(),
        status: "Pending Review",
      });
      // Mark corresponding task complete
      const taskKeyMap: Record<string, string> = { W9: "w9", ID: "id_upload" };
      if (taskKeyMap[docType]) {
        await storage.updateTaskStatus(Number(req.params.id), taskKeyMap[docType], "complete");
      }
      void sendDiscordWebhook("agent.document_added", { agentId: Number(req.params.id), document: doc });
      res.status(201).json(doc);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── Payout Setup ──────────────────────────────────────────────────────────
  app.post("/api/agents/:id/payout", async (req, res) => {
    const { payoutMethodType, payoutDetails, sofiReferralStatus } = req.body;
    const agent = await storage.updateAgent(Number(req.params.id), {
      payoutMethodType,
      payoutDetails,
      sofiReferralStatus: sofiReferralStatus || "Not Invited",
    });
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    await storage.updateTaskStatus(Number(req.params.id), "payout", "complete");
    void sendDiscordWebhook("agent.payout_submitted", { agent });
    res.json(agent);
  });

  // ── Training ──────────────────────────────────────────────────────────────
  app.get("/api/agents/:id/training", async (req, res) => {
    const progress = await storage.getTrainingProgress(Number(req.params.id));
    res.json(progress);
  });

  app.post("/api/agents/:id/training/:moduleKey/complete", async (req, res) => {
    const progress = await storage.upsertTrainingProgress(Number(req.params.id), req.params.moduleKey);
    // Check if all training modules done
    const all = await storage.getTrainingProgress(Number(req.params.id));
    if (all.length > 0 && all.every((m) => m.completed)) {
      await storage.updateTaskStatus(Number(req.params.id), "training", "complete");
    }
    void sendDiscordWebhook("agent.training_completed", { agentId: Number(req.params.id), moduleKey: req.params.moduleKey, progress });
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
