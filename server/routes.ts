import type { Express } from "express";
import { createServer, type Server } from "http";
import { getSharedAuthDiagnostics, requireSharedAdmin, requireSharedAuth } from "./auth.js";
import { clearAgentSessionCookie, createAgentSession, deleteAgentSession, requireAgentAuth, requireAgentOrAdmin, setAgentSessionCookie } from "./agent-auth.js";
import { pool } from "./db.js";
import { sendDiscordWebhook } from "./discord.js";
import { decryptTempPassword, encryptTempPassword, generateTempPassword } from "./email-provisioning.js";
import { clearHrAdminCookie, createHrAdminToken, hasHrAdminCookie, setHrAdminCookie, verifyHrAdminAccessCode } from "./hr-admin-access.js";
import { listStatusEvents, logStatusEvent } from "./status-events.js";
import { storage } from "./storage.js";
import { insertAgentSchema, insertIcaSignatureSchema } from "../shared/schema.js";
import { PIPELINE_STAGES, normalizePipelineStage } from "../shared/status.js";
import { z } from "zod";

const debugEndpointsEnabled = process.env.DEBUG_ENDPOINTS === "1" || process.env.NODE_ENV !== "production";

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

function parseHostLike(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      return normalizeHostname(new URL(raw).hostname);
    } catch {
      return "";
    }
  }
  if (/[/?#]/.test(raw)) {
    try {
      return normalizeHostname(new URL(`https://${raw}`).hostname);
    } catch {
      return "";
    }
  }
  return normalizeHostname(raw);
}

function normalizeAllowlistPattern(value: string) {
  const raw = value.trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("*.")) {
    const root = normalizeHostname(raw.slice(2));
    return root ? `*.${root}` : "";
  }
  if (raw.startsWith(".")) {
    const root = normalizeHostname(raw.slice(1));
    return root ? `.${root}` : "";
  }
  return parseHostLike(raw);
}

function hostMatchesPattern(host: string, pattern: string) {
  if (!host || !pattern) return false;
  if (pattern.startsWith("*.")) {
    const root = pattern.slice(2);
    return host !== root && host.endsWith(`.${root}`);
  }
  if (pattern.startsWith(".")) {
    const root = pattern.slice(1);
    return host === root || host.endsWith(`.${root}`);
  }
  return host === pattern;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function getRequestHost(req: { headers: Record<string, unknown> }) {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = typeof forwarded === "string"
    ? forwarded.split(",")[0] ?? ""
    : typeof req.headers.host === "string"
      ? req.headers.host
      : "";
  return parseHostLike(raw);
}

function signupIsAllowed(req: { headers: Record<string, unknown> }) {
  if (process.env.NODE_ENV !== "production") return true;
  if ((process.env.APP_PUBLIC_SIGNUP || "").trim() === "1") return true;

  const host = getRequestHost(req);
  const allowed = (process.env.SIGNUP_ALLOWED_HOSTS || "")
    .split(",")
    .map((value) => normalizeAllowlistPattern(value))
    .filter(Boolean);
  if (!allowed.length) return false;
  return allowed.some((pattern) => hostMatchesPattern(host, pattern));
}

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
const hrAdminLoginSchema = z.object({ code: z.string().trim().min(1) });
const emailRequestListQuerySchema = z.object({
  agentId: z.string().trim().optional(),
  status: z.string().trim().optional(),
  limit: z.string().trim().optional(),
});
const emailRequestUpdateSchema = z.object({
  requestedEmail: z.string().trim().optional(),
  status: z.enum(["requested", "created", "rejected"]).optional(),
  notes: z.string().trim().optional(),
  tempPassword: z.string().trim().min(8).optional(),
  generateTempPassword: z.boolean().optional(),
});
const emailRequestSchema = z.object({ localPart: z.string().trim().min(1).max(64) });

function serializeEmailRequest(request: any) {
  if (!request) return null;
  const {
    id,
    agentId,
    requestedEmail,
    status,
    tempPasswordCreatedAt,
    tempPasswordRevealedAt,
    createdAt,
    updatedAt,
    notes,
  } = request;
  return { id, agentId, requestedEmail, status, tempPasswordCreatedAt, tempPasswordRevealedAt, createdAt, updatedAt, notes };
}

function normalizeEmailLocalPart(value: string) {
  const raw = value.trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9._-]/g, "");
  const normalized = cleaned.replace(/\.+/g, ".").replace(/^-+/, "").replace(/-+$/, "").replace(/^_+/, "").replace(/_+$/, "");
  return normalized;
}

function validateEmailLocalPart(value: string) {
  if (!/^[a-z][a-z0-9._-]{2,31}$/.test(value)) return "Use 3-32 characters: letters, numbers, dot, underscore, hyphen.";
  if (value.includes("..")) return "Email alias cannot contain consecutive dots.";
  if (value.startsWith(".") || value.endsWith(".")) return "Email alias cannot start or end with a dot.";
  return null;
}

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

  app.get("/api/healthz", async (_req, res) => {
    try {
      await pool.query("select 1 as ok");
      return res.json({ ok: true, dbOk: true });
    } catch {
      return res.status(503).json({ ok: false, dbOk: false });
    }
  });

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
    const staleCookieLikely = Boolean((diagnostics as any)?.staleCookieLikely);
    const actionHint = typeof (diagnostics as any)?.actionHint === "string" ? (diagnostics as any).actionHint : null;
    res.json({
      dbOk,
      debugEndpointsEnabled,
      message: debugEndpointsEnabled ? "" : "Enable DEBUG_ENDPOINTS=1 to access deeper diagnostics at /api/debug/auth",
      staleCookieLikely,
      actionHint,
      diagnostics,
      hrAdmin: {
        enabled: Boolean(process.env.HR_ADMIN_ACCESS_CODE?.trim()) && Boolean(process.env.HR_ADMIN_TOKEN_SECRET?.trim()),
        hasCookie: hasHrAdminCookie(req),
      },
    });
  });

  app.post("/api/admin/access/login", async (req, res) => {
    const parsed = hrAdminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid login payload", issues: parsed.error.issues });
    }

    const ok = verifyHrAdminAccessCode(parsed.data.code);
    if (!ok) return res.status(401).json({ message: "Invalid access code" });

    const token = createHrAdminToken();
    if (!token) return res.status(500).json({ message: "HR admin access is not configured" });

    setHrAdminCookie(res, token);
    return res.json({ ok: true });
  });

  app.post("/api/admin/access/logout", async (_req, res) => {
    clearHrAdminCookie(res);
    res.json({ ok: true });
  });

  app.post("/api/agent/login", async (req, res) => {
    const schema = z.object({ phone: z.string().trim().min(1), phoneLast4: z.string().trim().regex(/^\d{4}$/) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid login payload", issues: parsed.error.issues });
    }

    const phoneNormalized = normalizePhone(parsed.data.phone);
    if (phoneNormalized.length < 10) {
      return res.status(400).json({ message: "Enter a valid phone number." });
    }

    const agent = await storage.getAgentByPhoneNormalized(phoneNormalized);
    const last4 = phoneNormalized.slice(-4);
    if (!agent || !last4 || last4 !== parsed.data.phoneLast4) {
      return res.status(401).json({ message: "Sign-in failed. Double-check your phone number and last 4 digits." });
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

  async function handleAgentPersonalEmail(req: any, res: any) {
    const schema = z.object({ personalEmail: z.string().trim().optional(), email: z.string().trim().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid email payload", issues: parsed.error.issues });
    }

    const agentId = req.agentUser!.agentId;
    const agent = await storage.getAgent(agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    if (!agent.onboardingComplete) {
      return res.status(400).json({ message: "Finish onboarding before adding a personal email." });
    }

    const raw = (parsed.data.personalEmail ?? parsed.data.email ?? "").trim();
    const normalized = raw ? raw.toLowerCase() : "";
    if (normalized) {
      const ok = z.string().email().safeParse(normalized).success;
      if (!ok) return res.status(400).json({ message: "Enter a valid email address." });
    }

    const previous = String(agent.personalEmail || "");
    const updated = await storage.updateAgent(agentId, { personalEmail: normalized || null });
    if (!updated) return res.status(404).json({ message: "Agent not found" });

    await logStatusEvent({
      agentId,
      eventType: "agent.personal_email_updated",
      actorType: "agent",
      actorId: String(agentId),
      oldValue: previous,
      newValue: normalized,
      metadata: { personalEmail: normalized || "" },
    });

    res.json({ ok: true, agent: updated });
  }

  app.post("/api/agent/personal-email", requireAgentAuth, handleAgentPersonalEmail);
  app.patch("/api/agent/personal-email", requireAgentAuth, handleAgentPersonalEmail);

  app.get("/api/agent/status", requireAgentAuth, async (req, res) => {
    const agentId = req.agentUser!.agentId;
    const summary = await buildStatusSummary(agentId);
    if (!summary) return res.status(404).json({ message: "Agent not found" });
    res.json(summary);
  });

  app.get("/api/agent/email-request", requireAgentAuth, async (req, res) => {
    const agentId = req.agentUser!.agentId;
    const [request] = await storage.getEmailRequests({ agentId, limit: 1 });
    res.json(serializeEmailRequest(request));
  });

  app.post("/api/agent/email-request", requireAgentAuth, async (req, res) => {
    const parsed = emailRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid email request payload", issues: parsed.error.issues });
    }

    const agentId = req.agentUser!.agentId;
    const agent = await storage.getAgent(agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    if (!agent.onboardingComplete) {
      return res.status(400).json({ message: "Complete onboarding before requesting an Ocean Luxe email." });
    }

    const localPart = normalizeEmailLocalPart(parsed.data.localPart);
    const validationError = validateEmailLocalPart(localPart);
    if (validationError) return res.status(400).json({ message: validationError });

    const requestedEmail = `${localPart}@oceanluxe.org`;
    const existingByEmail = await storage.getEmailRequestByRequestedEmail(requestedEmail);
    if (existingByEmail && existingByEmail.agentId !== agentId) {
      return res.status(409).json({ message: "This email alias is already requested.", requestedEmail });
    }

    const existing = (await storage.getEmailRequests({ agentId, limit: 1 }))[0];
    const tempPassword = generateTempPassword();
    const ciphertext = encryptTempPassword(tempPassword);
    const now = new Date().toISOString();

    const request = existing
      ? await storage.updateEmailRequest(existing.id, {
        requestedEmail,
        status: "requested",
        tempPasswordCiphertext: ciphertext,
        tempPasswordCreatedAt: now,
        tempPasswordRevealedAt: "",
        notes: "",
        updatedAt: now,
      })
      : await storage.createEmailRequest({
        agentId,
        requestedEmail,
        status: "requested",
        tempPasswordCiphertext: ciphertext,
        tempPasswordCreatedAt: now,
        tempPasswordRevealedAt: "",
        notes: "",
        createdAt: now,
        updatedAt: now,
      });

    await logStatusEvent({
      agentId,
      eventType: "agent.email_requested",
      actorType: "agent",
      actorId: String(agentId),
      metadata: { requestedEmail },
    });

    void sendDiscordWebhook("agent.email_requested", {
      agentId,
      requestedEmail,
      emailRequestId: request.id,
      timestamp: now,
    }).catch((error) => {
      console.error("Discord webhook failed (agent.email_requested):", error);
    });

    res.status(existing ? 200 : 201).json({ request: serializeEmailRequest(request), tempPassword });
  });

  app.post("/api/agents/:id/ocean-email-request", requireAgentOrAdmin("id"), async (req, res) => {
    const parsed = emailRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid email request payload", issues: parsed.error.issues });
    }

    const agentId = Number(String(req.params.id));
    const agent = await storage.getAgent(agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    if (!agent.onboardingComplete) {
      return res.status(400).json({ message: "Complete onboarding before requesting an Ocean Luxe email." });
    }

    const localPart = normalizeEmailLocalPart(parsed.data.localPart);
    const validationError = validateEmailLocalPart(localPart);
    if (validationError) return res.status(400).json({ message: validationError });

    const requestedEmail = `${localPart}@oceanluxe.org`;
    const existingByEmail = await storage.getEmailRequestByRequestedEmail(requestedEmail);
    if (existingByEmail && existingByEmail.agentId !== agentId) {
      return res.status(409).json({ message: "This email alias is already requested.", requestedEmail });
    }

    const existing = (await storage.getEmailRequests({ agentId, limit: 1 }))[0];
    const tempPassword = generateTempPassword();
    const ciphertext = encryptTempPassword(tempPassword);
    const now = new Date().toISOString();

    const request = existing
      ? await storage.updateEmailRequest(existing.id, {
        requestedEmail,
        status: "requested",
        tempPasswordCiphertext: ciphertext,
        tempPasswordCreatedAt: now,
        tempPasswordRevealedAt: "",
        notes: "",
        updatedAt: now,
      })
      : await storage.createEmailRequest({
        agentId,
        requestedEmail,
        status: "requested",
        tempPasswordCiphertext: ciphertext,
        tempPasswordCreatedAt: now,
        tempPasswordRevealedAt: "",
        notes: "",
        createdAt: now,
        updatedAt: now,
      });

    await logStatusEvent({
      agentId,
      eventType: "agent.email_requested",
      actorType: req.authUser ? "admin" : "agent",
      actorId: String(req.authUser?.id ?? agentId),
      metadata: { requestedEmail },
    });

    void sendDiscordWebhook("agent.email_requested", {
      agentId,
      requestedEmail,
      emailRequestId: request.id,
      timestamp: now,
    }).catch((error) => {
      console.error("Discord webhook failed (agent.email_requested):", error);
    });

    res.status(existing ? 200 : 201).json({ request: serializeEmailRequest(request), tempPassword });
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
    if (!signupIsAllowed(req)) {
      return res.status(403).json({
        message: "Signup is disabled on this deployment.",
        actionHint: "Open signup on an approved Ocean Luxe domain (e.g. https://career.oceanluxe.org) or ask an admin to add this host to the signup allowlist for this deployment.",
        host: getRequestHost(req),
      });
    }

    try {
      const schema = z.object({
        name: z.string().trim().min(1),
        phone: z.string().trim().min(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Enter your name and phone number to continue.", issues: parsed.error.issues });
      }

      const phoneNormalized = normalizePhone(parsed.data.phone);
      if (phoneNormalized.length < 10) {
        return res.status(400).json({ message: "Enter a valid phone number." });
      }

      const existingByPhone = await storage.getAgentByPhoneNormalized(phoneNormalized);
      if (existingByPhone) {
        return res.status(409).json({ message: "An agent profile already exists for this phone number." });
      }

      const data = insertAgentSchema.parse({
        name: parsed.data.name,
        phone: parsed.data.phone,
        phoneNormalized,
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
        metadata: { name: agent.name, phone: phoneNormalized },
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
      const constraint = (e as { constraint?: unknown } | null)?.constraint;

      if (code === "23505") {
        if (typeof constraint === "string" && constraint.includes("phone_normalized")) {
          return res.status(409).json({ message: "An agent profile already exists for this phone number." });
        }
        return res.status(409).json({ message: "This agent record already exists." });
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

    if (typeof payload.phone === "string" && typeof payload.phoneNormalized !== "string") {
      const normalized = normalizePhone(payload.phone);
      if (normalized.length >= 10) {
        payload.phoneNormalized = normalized;
      }
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

  app.get("/api/admin/email-requests", requireSharedAdmin, async (req, res) => {
    const parsed = emailRequestListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid query", issues: parsed.error.issues });
    }

    const agentIdRaw = (parsed.data.agentId || "").trim();
    const agentIdValue = agentIdRaw ? Number(agentIdRaw) : 0;
    if (agentIdRaw && (!Number.isFinite(agentIdValue) || agentIdValue <= 0)) {
      return res.status(400).json({ message: "Invalid agentId" });
    }
    const agentId = agentIdRaw ? agentIdValue : undefined;

    const limit = parsed.data.limit ? Number(parsed.data.limit) : undefined;
    const safeLimit = typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 250) : undefined;
    const requests = await storage.getEmailRequests({
      agentId,
      status: parsed.data.status || undefined,
      limit: safeLimit,
    });

    res.json(requests.map((request) => ({
      ...serializeEmailRequest(request),
      hasTempPassword: Boolean((request?.tempPasswordCiphertext || "").trim()),
    })));
  });

  async function handleEmailRequestReveal(req: any, res: any) {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid request id" });
    const request = await storage.getEmailRequest(id);
    if (!request) return res.status(404).json({ message: "Email request not found" });
    if (!(request.tempPasswordCiphertext || "").trim()) {
      return res.status(400).json({ message: "Temp password not available." });
    }

    const tempPassword = decryptTempPassword(request.tempPasswordCiphertext);
    const now = new Date().toISOString();
    if (!(request.tempPasswordRevealedAt || "").trim()) {
      await storage.updateEmailRequest(request.id, { tempPasswordRevealedAt: now, updatedAt: now });
      await logStatusEvent({
        agentId: request.agentId,
        eventType: "email.temp_password_revealed",
        actorType: "admin",
        actorId: String(req.authUser?.id ?? ""),
        metadata: { requestedEmail: request.requestedEmail, emailRequestId: request.id },
      });
    }

    return res.json({ tempPassword });
  }

  app.get("/api/admin/email-requests/:id/reveal", requireSharedAdmin, handleEmailRequestReveal);
  app.post("/api/admin/email-requests/:id/reveal", requireSharedAdmin, handleEmailRequestReveal);

  app.patch("/api/admin/email-requests/:id", requireSharedAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid request id" });

    const parsed = emailRequestUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid update payload", issues: parsed.error.issues });
    }

    const request = await storage.getEmailRequest(id);
    if (!request) return res.status(404).json({ message: "Email request not found" });

    const requestedEmailRaw = (parsed.data.requestedEmail || "").trim();
    const requestedEmail = requestedEmailRaw ? requestedEmailRaw.toLowerCase() : "";
    if (requestedEmail) {
      const ok = z.string().email().safeParse(requestedEmail).success;
      if (!ok) return res.status(400).json({ message: "Invalid requested email" });
      const existing = await storage.getEmailRequestByRequestedEmail(requestedEmail);
      if (existing && existing.id !== request.id) {
        return res.status(409).json({ message: "This email alias is already requested.", requestedEmail });
      }
    }

    const now = new Date().toISOString();
    const suppliedTempPassword = (parsed.data.tempPassword || "").trim();
    const shouldGenerate = parsed.data.generateTempPassword === true && !suppliedTempPassword;
    const nextTempPassword = suppliedTempPassword ? suppliedTempPassword : shouldGenerate ? generateTempPassword() : "";

    try {
      const updated = await storage.updateEmailRequest(id, {
        requestedEmail: requestedEmail ? requestedEmail : undefined,
        status: parsed.data.status ?? undefined,
        notes: typeof parsed.data.notes === "string" ? parsed.data.notes : undefined,
        tempPasswordCiphertext: nextTempPassword ? encryptTempPassword(nextTempPassword) : undefined,
        tempPasswordCreatedAt: nextTempPassword ? now : undefined,
        tempPasswordRevealedAt: nextTempPassword ? "" : undefined,
        updatedAt: now,
      });

      res.json({
        ...serializeEmailRequest(updated),
        hasTempPassword: Boolean((updated?.tempPasswordCiphertext || "").trim()),
      });
    } catch (e: any) {
      const code = (e as { code?: unknown } | null)?.code;
      if (code === "23505") {
        return res.status(409).json({ message: "This email alias is already requested.", requestedEmail });
      }
      const error = e instanceof Error ? e : new Error(String(e));
      return res.status(500).json({ message: error.message || "Internal Server Error" });
    }
  });

  app.patch("/api/admin/email-requests/:id/status", requireSharedAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid request id" });
    const schema = z.object({ status: z.enum(["requested", "created", "rejected"]), notes: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid status payload", issues: parsed.error.issues });
    }
    const request = await storage.getEmailRequest(id);
    if (!request) return res.status(404).json({ message: "Email request not found" });
    const previousStatus = request.status;
    const now = new Date().toISOString();
    const updated = await storage.updateEmailRequest(id, {
      status: parsed.data.status,
      notes: (parsed.data.notes || request.notes || "").trim(),
      updatedAt: now,
    });
    await logStatusEvent({
      agentId: request.agentId,
      eventType: parsed.data.status === "created"
        ? "agent.email_created"
        : parsed.data.status === "rejected"
          ? "agent.email_rejected"
          : "agent.email_requested",
      actorType: "admin",
      actorId: String(req.authUser?.id ?? ""),
      oldValue: previousStatus,
      newValue: parsed.data.status,
      metadata: { requestedEmail: request.requestedEmail, emailRequestId: request.id },
    });
    if (parsed.data.status === "created" && previousStatus !== "created") {
      void sendDiscordWebhook("agent.email_created", {
        agentId: request.agentId,
        requestedEmail: request.requestedEmail,
        emailRequestId: request.id,
        timestamp: now,
      }).catch((error) => {
        console.error("Discord webhook failed (agent.email_created):", error);
      });
    }
    res.json({
      ...serializeEmailRequest(updated),
      hasTempPassword: Boolean((updated?.tempPasswordCiphertext || "").trim()),
    });
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
