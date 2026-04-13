import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAgentSchema, insertIcaSignatureSchema } from "@shared/schema";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ── Agents ────────────────────────────────────────────────────────────────
  app.get("/api/agents", (_req, res) => {
    const all = storage.getAllAgents();
    res.json(all);
  });

  app.get("/api/agents/:id", (req, res) => {
    const agent = storage.getAgent(Number(req.params.id));
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    res.json(agent);
  });

  app.post("/api/agents", (req, res) => {
    try {
      const data = insertAgentSchema.parse({
        ...req.body,
        startDate: new Date().toISOString(),
        subscriptionStatus: "Trial",
        onboardingStep: 1,
        onboardingComplete: false,
      });
      const agent = storage.createAgent(data);
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
        storage.upsertOnboardingTask({ agentId: agent.id, ...s, status: "pending" });
      }
      // Mark first step in progress
      storage.updateTaskStatus(agent.id, "profile", "in_progress");
      storage.initTrainingModules(agent.id);
      res.status(201).json(agent);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/agents/:id", (req, res) => {
    const agent = storage.updateAgent(Number(req.params.id), req.body);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    res.json(agent);
  });

  // ── Onboarding ────────────────────────────────────────────────────────────
  app.get("/api/agents/:id/onboarding", (req, res) => {
    const tasks = storage.getOnboardingTasks(Number(req.params.id));
    res.json(tasks);
  });

  app.patch("/api/agents/:id/onboarding/:taskKey", (req, res) => {
    const { status } = req.body;
    const task = storage.updateTaskStatus(Number(req.params.id), req.params.taskKey, status);
    if (!task) return res.status(404).json({ message: "Task not found" });

    // Auto-advance agent's onboarding step
    if (status === "complete") {
      const tasks = storage.getOnboardingTasks(Number(req.params.id));
      const nextPending = tasks.find(t => t.status === "pending");
      const allComplete = tasks.every(t => t.status === "complete");

      if (nextPending) {
        storage.updateTaskStatus(Number(req.params.id), nextPending.taskKey, "in_progress");
        storage.updateAgent(Number(req.params.id), { onboardingStep: nextPending.stepNumber });
      }
      if (allComplete) {
        storage.updateAgent(Number(req.params.id), { onboardingComplete: true });
      }
    }
    res.json(task);
  });

  // ── ICA Signature ─────────────────────────────────────────────────────────
  app.get("/api/agents/:id/ica", (req, res) => {
    const sig = storage.getIcaSignature(Number(req.params.id));
    res.json(sig || null);
  });

  app.post("/api/agents/:id/ica", (req, res) => {
    try {
      const data = insertIcaSignatureSchema.parse({
        ...req.body,
        agentId: Number(req.params.id),
        signedAt: new Date().toISOString(),
      });
      const sig = storage.createIcaSignature(data);
      // Mark ICA task complete
      storage.updateTaskStatus(Number(req.params.id), "ica", "complete");
      res.status(201).json(sig);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── Documents ─────────────────────────────────────────────────────────────
  app.get("/api/agents/:id/documents", (req, res) => {
    const docs = storage.getDocuments(Number(req.params.id));
    res.json(docs);
  });

  app.post("/api/agents/:id/documents", (req, res) => {
    try {
      const { docType, fileName, fileUrl } = req.body;
      const doc = storage.createDocument({
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
        storage.updateTaskStatus(Number(req.params.id), taskKeyMap[docType], "complete");
      }
      res.status(201).json(doc);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // ── Payout Setup ──────────────────────────────────────────────────────────
  app.post("/api/agents/:id/payout", (req, res) => {
    const { payoutMethodType, payoutDetails, sofiReferralStatus } = req.body;
    const agent = storage.updateAgent(Number(req.params.id), {
      payoutMethodType,
      payoutDetails,
      sofiReferralStatus: sofiReferralStatus || "Not Invited",
    });
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    storage.updateTaskStatus(Number(req.params.id), "payout", "complete");
    res.json(agent);
  });

  // ── Training ──────────────────────────────────────────────────────────────
  app.get("/api/agents/:id/training", (req, res) => {
    const progress = storage.getTrainingProgress(Number(req.params.id));
    res.json(progress);
  });

  app.post("/api/agents/:id/training/:moduleKey/complete", (req, res) => {
    const progress = storage.upsertTrainingProgress(Number(req.params.id), req.params.moduleKey);
    // Check if all training modules done
    const all = storage.getTrainingProgress(Number(req.params.id));
    if (all.length > 0 && all.every(m => m.completed)) {
      storage.updateTaskStatus(Number(req.params.id), "training", "complete");
    }
    res.json(progress);
  });

  // ── Stats (Admin summary) ─────────────────────────────────────────────────
  app.get("/api/stats", (_req, res) => {
    const all = storage.getAllAgents();
    const active = all.filter(a => a.subscriptionStatus === "Active").length;
    const trial = all.filter(a => a.subscriptionStatus === "Trial").length;
    const complete = all.filter(a => a.onboardingComplete).length;
    const mrr = active * 50;
    const goal = 5000;
    res.json({ total: all.length, active, trial, complete, mrr, goal, mrrPercent: Math.round((mrr / goal) * 100) });
  });

  return httpServer;
}
