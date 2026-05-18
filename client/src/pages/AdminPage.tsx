import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  DollarSign,
  FileCheck2,
  FileText,
  RefreshCcw,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import type { Agent, Document, IcaSignature, OnboardingTask, TrainingProgress } from "@shared/schema";
import { PIPELINE_STAGES } from "@shared/status";
import luxeLogo from "@assets/luxe-logo.jpg";

const OceanLuxeLogo = () => (
  <div className="flex items-center gap-2.5" aria-label="Ocean Luxe Estate LLC">
    <img src={luxeLogo} alt="Ocean Luxe shell logo" className="h-8 w-8 rounded-md object-cover" />
    <div className="flex flex-col leading-none gap-0.5">
      <span className="text-sm font-semibold tracking-widest text-white" style={{ fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.12em" }}>
        OCEAN LUXE
      </span>
      <span className="text-[8px] tracking-[0.22em] uppercase" style={{ color: "hsl(43,85%,52%)" }}>Estate LLC</span>
    </div>
  </div>
);

interface Stats {
  total: number;
  active: number;
  trial: number;
  paused: number;
  cancelled: number;
  complete: number;
  inProgress: number;
  pendingDocs: number;
  mrr: number;
  goal: number;
  mrrPercent: number;
}

interface AdminAgentDetails {
  agent: Agent;
  tasks: OnboardingTask[];
  documents: Document[];
  ica: IcaSignature | null;
  training: TrainingProgress[];
  metrics: {
    progressPercent: number;
    completedTasks: number;
    pendingDocs: number;
    completedTrainingModules: number;
  };
}

interface SharedAdminUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug: string | null;
  organizationRole: string | null;
}

interface StatusEvent {
  id: number;
  agentId: number;
  eventType: string;
  actorType: string;
  actorId: string;
  oldValue: string;
  newValue: string;
  metadataJson: string;
  createdAt: string;
}

interface AdminStatusEvent extends StatusEvent {
  agentName: string;
  agentSubscriptionStatus: string;
  agentPipelineStage: string;
  agentCompanyEmail: string;
}

interface AdminEventsPage<TEvent> {
  events: TEvent[];
  nextCursor: number | null;
}

interface AgentStatusSummary {
  agentId: number;
  pipelineStage: string;
  subscriptionStatus: string;
  onboarding: {
    step: number;
    complete: boolean;
    progressPercent: number;
    currentTask: OnboardingTask | null;
  };
  documents: {
    pendingReview: number;
  };
  training: {
    completed: number;
    total: number;
  };
  payout: {
    submitted: boolean;
    payoutMethodType: string | null;
  };
  events: StatusEvent[];
}

interface EmailRequestSummary {
  id: number;
  agentId: number;
  requestedEmail: string;
  status: string;
  tempPasswordCreatedAt: string;
  tempPasswordRevealedAt: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
}

function formatEventTime(value: string) {
  try {
    return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return value;
  }
}

function formatEventLabel(evt: Pick<StatusEvent, "eventType" | "oldValue" | "newValue">) {
  const t = evt.eventType;
  if (t === "agent.created") return "Application submitted";
  if (t === "crm.pipeline_stage_changed" || t === "pipeline.stage_changed") return `Stage updated: ${evt.oldValue} → ${evt.newValue}`;
  if (t === "subscription.status_changed") return `Subscription: ${evt.oldValue} → ${evt.newValue}`;
  if (t === "onboarding.task_completed") return "Onboarding step completed";
  if (t === "onboarding.task_started") return "Onboarding task started";
  if (t === "onboarding.completed") return "Onboarding completed";
  if (t === "document.uploaded") return "Document uploaded";
  if (t === "document.status_changed") return `Document review: ${evt.newValue}`;
  if (t === "ica.signed") return "ICA signed";
  if (t === "payout.submitted") return "Payout method submitted";
  if (t === "email.temp_password_revealed") return "Temp email password revealed";
  if (t === "email.temp_password_reset") return "Temp email password reset";
  if (t === "email.requested_email_changed") return "Requested email updated";
  if (t === "agent.email_requested") return "Company email requested";
  if (t === "agent.email_created") return "Company email created";
  if (t === "agent.email_rejected") return "Company email rejected";
  if (t === "training.completed") return "Training completed";
  if (t === "training.module_completed") return "Training module completed";
  if (t === "sofi.referral_opened") return "SoFi referral link opened";
  return t;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, CSSProperties> = {
    Active: { background: "rgba(212,168,45,0.12)", color: "hsl(43,85%,42%)", border: "1px solid rgba(212,168,45,0.3)" },
    Trial: { background: "rgba(0,0,0,0.05)", color: "#555", border: "1px solid #ddd" },
    Paused: { background: "rgba(0,0,0,0.04)", color: "#888", border: "1px solid #ddd" },
    Cancelled: { background: "rgba(200,0,0,0.06)", color: "#c00", border: "1px solid rgba(200,0,0,0.2)" },
  };

  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide" style={styles[status] || styles.Trial}>
      {status}
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Stage</span>
      <span>{stage || "Applicant"}</span>
    </span>
  );
}

type CurrentStageVariant = "gold" | "muted" | "danger" | "success";

function deriveCurrentStage(input: {
  subscriptionStatus: string;
  pipelineStage: string;
  onboardingComplete: boolean;
  onboardingProgressPercent?: number;
  trainingCompleted?: number;
  trainingTotal?: number;
  emailRequestStatus?: string | null;
  companyEmail?: string | null;
}) {
  const subscription = (input.subscriptionStatus || "").trim();
  const pipeline = (input.pipelineStage || "").trim() || "Applicant";
  const emailRequestStatus = (input.emailRequestStatus || "").trim();
  const hasCompanyEmail = Boolean((input.companyEmail || "").trim());

  if (subscription === "Cancelled") return { label: "Cancelled", variant: "danger" as const };
  if (subscription === "Paused") return { label: "Paused", variant: "muted" as const };

  if (pipeline === "Applicant") return { label: "Applicant", variant: "muted" as const };
  if (pipeline === "Interview") return { label: "Interview", variant: "muted" as const };
  if (pipeline === "Offer") return { label: "Offer Sent", variant: "gold" as const };

  if (pipeline === "Hired") {
    if (!input.onboardingComplete) {
      const pct = Math.max(0, Math.min(100, Math.round(input.onboardingProgressPercent ?? 0)));
      return { label: `Onboarding ${pct}%`, variant: "gold" as const };
    }

    if (typeof input.trainingTotal === "number" && input.trainingTotal > 0 && typeof input.trainingCompleted === "number") {
      if (input.trainingCompleted < input.trainingTotal) {
        return { label: `Training ${input.trainingCompleted}/${input.trainingTotal}`, variant: "gold" as const };
      }
    }

    if (!hasCompanyEmail) {
      if (emailRequestStatus === "requested") return { label: "Email Requested", variant: "gold" as const };
      if (emailRequestStatus === "created") return { label: "Email Created", variant: "success" as const };
      if (emailRequestStatus === "rejected") return { label: "Email Rejected", variant: "danger" as const };
      if (emailRequestStatus) return { label: `Email ${emailRequestStatus.replace("_", " ")}`, variant: "muted" as const };
      return { label: "Email Not Requested", variant: "muted" as const };
    }

    if (subscription !== "Active") return { label: "Ready to Activate", variant: "success" as const };
    return { label: "Active", variant: "success" as const };
  }

  if (pipeline === "Active") {
    if (subscription === "Active") return { label: "Active", variant: "success" as const };
    return { label: "Ready to Activate", variant: "success" as const };
  }

  if (subscription === "Active") return { label: "Active", variant: "success" as const };
  if (subscription === "Trial") return { label: "Trial", variant: "muted" as const };
  return { label: pipeline || subscription || "—", variant: "muted" as const };
}

function CurrentStageBadge({ label, variant }: { label: string; variant: CurrentStageVariant }) {
  const styles: Record<CurrentStageVariant, CSSProperties> = {
    gold: { background: "rgba(212,168,45,0.12)", color: "hsl(43,85%,42%)", border: "1px solid rgba(212,168,45,0.3)" },
    muted: { background: "rgba(0,0,0,0.04)", color: "#666", border: "1px solid #ddd" },
    danger: { background: "rgba(239,68,68,0.08)", color: "#b91c1c", border: "1px solid rgba(239,68,68,0.22)" },
    success: { background: "rgba(34,197,94,0.1)", color: "#15803d", border: "1px solid rgba(34,197,94,0.22)" },
  };

  return (
    <span className="inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide" style={styles[variant]}>
      <span className="text-[10px] uppercase tracking-[0.18em]" style={{ opacity: 0.8 }}>
        Current
      </span>
      <span>{label}</span>
    </span>
  );
}

function DocStatusBadge({ status }: { status: string }) {
  const styles: Record<string, CSSProperties> = {
    Approved: { background: "rgba(34,197,94,0.1)", color: "#15803d", border: "1px solid rgba(34,197,94,0.2)" },
    Rejected: { background: "rgba(239,68,68,0.1)", color: "#b91c1c", border: "1px solid rgba(239,68,68,0.2)" },
    "Pending Review": { background: "rgba(245,158,11,0.12)", color: "#b45309", border: "1px solid rgba(245,158,11,0.22)" },
  };

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" style={styles[status] || styles["Pending Review"]}>
      {status}
    </span>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const styles: Record<string, CSSProperties> = {
    complete: { background: "rgba(34,197,94,0.1)", color: "#15803d" },
    in_progress: { background: "rgba(245,158,11,0.12)", color: "#b45309" },
    pending: { background: "rgba(148,163,184,0.12)", color: "#64748b" },
  };

  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize" style={styles[status] || styles.pending}>
      {status.replace("_", " ")}
    </span>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

export default function AdminPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [onboardingFilter, setOnboardingFilter] = useState("all");
  const [authDiag, setAuthDiag] = useState<any | null>(null);
  const [authDiagError, setAuthDiagError] = useState<string>("");
  const [autoLoadedDiagnostics, setAutoLoadedDiagnostics] = useState(false);
  const [hrAccessCode, setHrAccessCode] = useState("");
  const [hrAccessError, setHrAccessError] = useState("");
  const [hrAccessLoading, setHrAccessLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<number, string>>({});
  const [editForm, setEditForm] = useState({
    subscriptionStatus: "Trial",
    payoutMethodType: "",
    payoutDetails: "",
    sofiReferralStatus: "Not Invited",
    sofiReferralLink: "",
    performanceNotes: "",
    crmRecordId: "",
    crmPipelineStage: "Applicant",
  });

  const {
    data: currentAdmin,
    isLoading: isLoadingAdmin,
    isError: hasAdminAccessError,
  } = useQuery<SharedAdminUser | null>({
    queryKey: ["/api/admin/me"],
    queryFn: async () => {
      const res = await fetch("/api/admin/me", { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        return null;
      }
      if (!res.ok) {
        throw new Error(`Failed to load admin session: ${res.status}`);
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (isLoadingAdmin) return;
    if (currentAdmin) return;
    if (autoLoadedDiagnostics) return;
    setAutoLoadedDiagnostics(true);
    setAuthDiagError("");
    fetch("/api/admin/auth/diagnostics", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Diagnostics failed: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setAuthDiag(data);
      })
      .catch((e: any) => {
        setAuthDiagError(e?.message || "Diagnostics failed");
      });
  }, [autoLoadedDiagnostics, currentAdmin, isLoadingAdmin]);

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    queryFn: async () => (await apiRequest("GET", "/api/stats")).json(),
    enabled: !!currentAdmin,
  });

  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    queryFn: async () => (await apiRequest("GET", "/api/agents")).json(),
    enabled: !!currentAdmin,
  });

  const { data: selectedAgentDetails, isFetching: isDetailsLoading } = useQuery<AdminAgentDetails>({
    queryKey: ["/api/admin/agents", selectedAgentId],
    queryFn: async () => (await apiRequest("GET", `/api/admin/agents/${selectedAgentId}`)).json(),
    enabled: !!currentAdmin && !!selectedAgentId,
  });

  const { data: selectedAgentStatus } = useQuery<AgentStatusSummary>({
    queryKey: ["/api/admin/agents", selectedAgentId, "status"],
    queryFn: async () => (await apiRequest("GET", `/api/admin/agents/${selectedAgentId}/status`)).json(),
    enabled: !!currentAdmin && !!selectedAgentId,
  });

  const globalEventsKey = ["/api/admin/events"] as const;
  const globalEvents = useInfiniteQuery<
    AdminEventsPage<AdminStatusEvent>,
    Error,
    InfiniteData<AdminEventsPage<AdminStatusEvent>, number | null>,
    typeof globalEventsKey,
    number | null
  >({
    queryKey: globalEventsKey,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const cursor = typeof pageParam === "number" ? `&cursor=${pageParam}` : "";
      return (await apiRequest("GET", `/api/admin/events?limit=60${cursor}`)).json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!currentAdmin,
  });

  const agentEventsKey = ["/api/admin/agents", selectedAgentId, "events"] as const;
  const agentEvents = useInfiniteQuery<
    AdminEventsPage<StatusEvent>,
    Error,
    InfiniteData<AdminEventsPage<StatusEvent>, number | null>,
    typeof agentEventsKey,
    number | null
  >({
    queryKey: agentEventsKey,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      if (!selectedAgentId) {
        return { events: [], nextCursor: null };
      }
      const cursor = typeof pageParam === "number" ? `&cursor=${pageParam}` : "";
      return (await apiRequest("GET", `/api/admin/agents/${selectedAgentId}/events?limit=75${cursor}`)).json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!currentAdmin && !!selectedAgentId,
  });

  const globalActivityEvents = globalEvents.data?.pages.flatMap((page) => page.events) ?? [];
  const agentTimelineEvents = agentEvents.data?.pages.flatMap((page) => page.events) ?? [];

  const { data: emailRequests = [], isLoading: isLoadingEmailRequests } = useQuery<EmailRequestSummary[]>({
    queryKey: ["/api/admin/email-requests"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/email-requests")).json(),
    enabled: !!currentAdmin,
  });

  const emailRequestIndex = useMemo(() => {
    const map = new Map<number, EmailRequestSummary>();
    for (const request of emailRequests) {
      map.set(request.agentId, request);
    }
    return map;
  }, [emailRequests]);

  const { mutate: revealEmailPassword, isPending: isRevealingEmailPassword } = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/admin/email-requests/${id}/reveal`, {})).json(),
    onSuccess: async (data: any, id: number) => {
      setRevealedPasswords((current) => ({ ...current, [id]: String(data?.tempPassword || "") }));
      await qc.invalidateQueries({ queryKey: ["/api/admin/email-requests"] });
    },
  });

  const { mutate: updateEmailRequestStatus, isPending: isUpdatingEmailRequestStatus } = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      (await apiRequest("PATCH", `/api/admin/email-requests/${id}/status`, { status })).json(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/admin/email-requests"] });
    },
  });

  const { mutate: activateAgent } = useMutation({
    mutationFn: async (agentId: number) => apiRequest("PATCH", `/api/agents/${agentId}`, { subscriptionStatus: "Active" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      if (selectedAgentId) {
        qc.invalidateQueries({ queryKey: ["/api/admin/agents", selectedAgentId] });
        qc.invalidateQueries({ queryKey: ["/api/admin/agents", selectedAgentId, "status"] });
      }
    },
  });

  const { mutate: saveAgent, isPending: isSavingAgent } = useMutation({
    mutationFn: async () => {
      if (!selectedAgentId) return null;
      return apiRequest("PATCH", `/api/agents/${selectedAgentId}`, editForm);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      if (selectedAgentId) {
        qc.invalidateQueries({ queryKey: ["/api/admin/agents", selectedAgentId] });
        qc.invalidateQueries({ queryKey: ["/api/admin/agents", selectedAgentId, "status"] });
      }
    },
  });

  const { mutate: updateDocumentStatus, isPending: isUpdatingDocument } = useMutation({
    mutationFn: async ({ documentId, status }: { documentId: number; status: string }) =>
      apiRequest("PATCH", `/api/admin/documents/${documentId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/agents"] });
      if (selectedAgentId) {
        qc.invalidateQueries({ queryKey: ["/api/admin/agents", selectedAgentId] });
        qc.invalidateQueries({ queryKey: ["/api/admin/agents", selectedAgentId, "status"] });
      }
    },
  });

  const { mutate: updatePipelineStage, isPending: isUpdatingStage } = useMutation({
    mutationFn: async ({ agentId, stage }: { agentId: number; stage: string }) =>
      apiRequest("PATCH", `/api/admin/agents/${agentId}/pipeline-stage`, { stage }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      if (selectedAgentId) {
        qc.invalidateQueries({ queryKey: ["/api/admin/agents", selectedAgentId] });
        qc.invalidateQueries({ queryKey: ["/api/admin/agents", selectedAgentId, "status"] });
      }
    },
  });

  const filteredAgents = useMemo(() => {
    const q = query.trim().toLowerCase();

    return agents.filter((agent) => {
      const matchesQuery =
        !q ||
        agent.name.toLowerCase().includes(q) ||
        (agent.personalEmail || agent.email || "").toLowerCase().includes(q) ||
        agent.phone.toLowerCase().includes(q) ||
        (agent.crmRecordId || "").toLowerCase().includes(q);

      const matchesStatus = statusFilter === "all" || agent.subscriptionStatus === statusFilter;
      const matchesOnboarding =
        onboardingFilter === "all" ||
        (onboardingFilter === "complete" && agent.onboardingComplete) ||
        (onboardingFilter === "in_progress" && !agent.onboardingComplete);

      return matchesQuery && matchesStatus && matchesOnboarding;
    });
  }, [agents, onboardingFilter, query, statusFilter]);

  useEffect(() => {
    if (!filteredAgents.length) {
      setSelectedAgentId(null);
      return;
    }

    if (!selectedAgentId || !filteredAgents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(filteredAgents[0].id);
    }
  }, [filteredAgents, selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentDetails) return;

    setEditForm({
      subscriptionStatus: selectedAgentDetails.agent.subscriptionStatus,
      payoutMethodType: selectedAgentDetails.agent.payoutMethodType || "",
      payoutDetails: selectedAgentDetails.agent.payoutDetails || "",
      sofiReferralStatus: selectedAgentDetails.agent.sofiReferralStatus,
      sofiReferralLink: selectedAgentDetails.agent.sofiReferralLink || "",
      performanceNotes: selectedAgentDetails.agent.performanceNotes || "",
      crmRecordId: selectedAgentDetails.agent.crmRecordId || "",
      crmPipelineStage: PIPELINE_STAGES.includes(selectedAgentDetails.agent.crmPipelineStage as any)
        ? (selectedAgentDetails.agent.crmPipelineStage as any)
        : "Applicant",
    });
  }, [selectedAgentDetails]);

  if (isLoadingAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-xl px-6 py-5 text-sm text-muted-foreground">
          Loading shared Ocean Luxe RM session...
        </div>
      </div>
    );
  }

  if (!currentAdmin) {
    const isVercel = typeof window !== "undefined" && window.location.hostname.endsWith("vercel.app");
    const staleCookieLikely = Boolean(authDiag?.staleCookieLikely);
    const actionHint = typeof authDiag?.actionHint === "string" ? authDiag.actionHint : "";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 text-center space-y-4">
          <img src={luxeLogo} alt="Ocean Luxe" className="h-14 w-14 rounded-xl object-cover mx-auto" />
          <div>
            <h1 className="text-2xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Admin Sign-In Required</h1>
            <p className="text-sm text-muted-foreground mt-2">
              The HR admin uses the same shared session as Ocean Luxe RM. Sign in through Luxe RM first, then return here.
            </p>
            {isVercel && (
              <p className="text-xs text-destructive mt-3">
                Admin SSO will not work on vercel.app. Use career.oceanluxe.org so the shared cookie can be read on this domain.
              </p>
            )}
          </div>
          {staleCookieLikely ? (
            <div className="rounded-xl border border-border p-4 text-left space-y-1 bg-muted/30">
              <p className="text-sm font-semibold">Stale session cookie detected</p>
              <p className="text-xs text-muted-foreground">{actionHint || "Clear cookies for this domain and sign in again in the CRM, then refresh this page."}</p>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            {isVercel && (
              <a
                href="https://career.oceanluxe.org/#/admin"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold"
                style={{ background: "#0a0a0a", color: "hsl(43,85%,52%)" }}
              >
                Open career.oceanluxe.org →
              </a>
            )}
            <a
              href="https://deals.oceanluxe.org"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold"
              style={{ background: "#0a0a0a", color: "hsl(43,85%,52%)" }}
            >
              Open CRM Login
            </a>

            <div className="rounded-xl border border-border p-4 text-left space-y-2">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">HR Access Code</p>
              <Input
                value={hrAccessCode}
                onChange={(e) => setHrAccessCode(e.target.value)}
                placeholder="Enter access code"
                type="password"
              />
              <button
                type="button"
                onClick={async () => {
                  setHrAccessError("");
                  setHrAccessLoading(true);
                  try {
                    const res = await fetch("/api/admin/access/login", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ code: hrAccessCode }),
                      credentials: "include",
                    });
                    if (!res.ok) {
                      const text = await res.text();
                      setHrAccessError(text || `Login failed: ${res.status}`);
                      return;
                    }
                    await qc.invalidateQueries({ queryKey: ["/api/admin/me"] });
                  } catch (e: any) {
                    setHrAccessError(e?.message || "Login failed");
                  } finally {
                    setHrAccessLoading(false);
                  }
                }}
                disabled={!hrAccessCode.trim() || hrAccessLoading}
                className="inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: "#0a0a0a", color: "hsl(43,85%,52%)" }}
              >
                Sign In →
              </button>
              {hrAccessError ? <p className="text-xs text-destructive">{hrAccessError}</p> : null}
            </div>

            <button
              type="button"
              onClick={async () => {
                setAuthDiagError("");
                setAuthDiag(null);
                try {
                  const res = await fetch("/api/admin/auth/diagnostics", { credentials: "include" });
                  if (!res.ok) {
                    const text = await res.text();
                    setAuthDiagError(text || `Diagnostics failed: ${res.status}`);
                    return;
                  }
                  setAuthDiag(await res.json());
                } catch (e: any) {
                  setAuthDiagError(e?.message || "Diagnostics failed");
                }
              }}
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              Check Auth Diagnostics
            </button>
            {authDiag?.debugEndpointsEnabled ? (
              <button
                type="button"
                onClick={async () => {
                  setAuthDiagError("");
                  try {
                    const res = await fetch("/api/debug/auth", { credentials: "include" });
                    if (!res.ok) {
                      const text = await res.text();
                      setAuthDiagError(text || `Diagnostics failed: ${res.status}`);
                      return;
                    }
                    setAuthDiag(await res.json());
                  } catch (e: any) {
                    setAuthDiagError(e?.message || "Diagnostics failed");
                  }
                }}
                className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                Deep Diagnostics
              </button>
            ) : null}
          </div>
          {hasAdminAccessError && (
            <p className="text-xs text-destructive">Admin session could not be loaded. Make sure the shared auth cookie is available on this domain.</p>
          )}
          {authDiagError && <p className="text-xs text-destructive">{authDiagError}</p>}
          {authDiag && (
            <pre className="text-[11px] text-left whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-3 max-h-48 overflow-auto">
              {JSON.stringify(authDiag, null, 2)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="ol-gradient ol-gold-line px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <button className="text-white/50 hover:text-white transition-colors"><ArrowLeft className="h-5 w-5" /></button>
          </Link>
          <OceanLuxeLogo />
        </div>
        <div className="text-right">
          <span className="text-xs tracking-widest uppercase px-3 py-1 rounded-full border inline-flex" style={{ borderColor: "rgba(212,168,45,0.3)", color: "hsl(43,85%,52%)" }}>
            Admin Panel
          </span>
          <p className="text-[11px] text-white/60 mt-2">
            {currentAdmin.name || currentAdmin.email || "Authenticated"}{currentAdmin.role ? ` · ${currentAdmin.role}` : ""}
          </p>
        </div>
      </nav>

      <div className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Hiring Dashboard</h1>
          <p className="text-sm text-muted-foreground tracking-wide mt-0.5">Ocean Luxe Estate LLC — Agent operations, compliance, and CRM linking</p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
            {[
              { label: "Total Agents", value: stats.total, sub: "of 100 goal", icon: <Users className="h-4 w-4 text-muted-foreground/40" />, testid: "stat-total" },
              { label: "Active ($50/mo)", value: stats.active, sub: `${stats.trial} on trial`, icon: <CheckCircle2 className="h-4 w-4 text-muted-foreground/40" />, testid: "stat-active", gold: true },
              { label: "Monthly Revenue", value: `$${stats.mrr.toLocaleString()}`, sub: `$${(stats.goal - stats.mrr).toLocaleString()} to $5K`, icon: <DollarSign className="h-4 w-4 text-muted-foreground/40" />, testid: "stat-mrr", gold: true },
              { label: "Goal Progress", value: `${stats.mrrPercent}%`, sub: null, icon: <TrendingUp className="h-4 w-4 text-muted-foreground/40" />, testid: "stat-mrr-pct" },
              { label: "In Progress", value: stats.inProgress, sub: `${stats.complete} complete`, icon: <CircleDashed className="h-4 w-4 text-muted-foreground/40" />, testid: "stat-in-progress" },
              { label: "Docs Pending", value: stats.pendingDocs, sub: `${stats.paused + stats.cancelled} paused/cancelled`, icon: <FileCheck2 className="h-4 w-4 text-muted-foreground/40" />, testid: "stat-docs-pending" },
            ].map((card) => (
              <div key={card.label} className="bg-card border border-border rounded-xl p-4 gold-hover">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground tracking-widest uppercase">{card.label}</span>
                  {card.icon}
                </div>
                <p className="text-2xl font-bold" data-testid={card.testid} style={card.gold ? { color: "hsl(43,85%,42%)", fontFamily: "'Cormorant Garamond', serif" } : { fontFamily: "'Cormorant Garamond', serif" }}>
                  {card.value}
                </p>
                {card.sub && <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>}
                {card.testid === "stat-mrr-pct" && <Progress value={stats.mrrPercent} className="mt-2 h-1.5" />}
              </div>
            ))}
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-4 mb-6">
          <div className="grid gap-3 lg:grid-cols-[1.6fr,1fr,1fr]">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, phone, or CRM record ID"
                className="pl-9"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="Trial">Trial</option>
              <option value="Active">Active</option>
              <option value="Paused">Paused</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <select
              value={onboardingFilter}
              onChange={(e) => setOnboardingFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All onboarding stages</option>
              <option value="in_progress">In progress</option>
              <option value="complete">Complete</option>
            </select>
          </div>
        </div>

        {stats && (
          <div className="bg-card border border-border rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-sm tracking-wide">MRR Progress to $5,000 Goal</span>
              <span className="text-sm font-bold" style={{ color: "hsl(43,85%,42%)", fontFamily: "'Cormorant Garamond', serif" }}>
                ${stats.mrr.toLocaleString()} / $5,000
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "#f0f0f0" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(stats.mrrPercent, 1)}%`, background: "linear-gradient(90deg, hsl(43,85%,45%), hsl(43,90%,58%))" }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2 tracking-wide">{100 - stats.active} more active agents needed to reach goal</p>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
            <div>
              <h2 className="font-semibold text-sm tracking-wide">Global Activity Feed</h2>
              <p className="text-xs text-muted-foreground mt-1">Latest admin + agent lifecycle events across Ocean Luxe</p>
            </div>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: globalEventsKey })}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              type="button"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
          </div>

          {globalEvents.isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading activity feed...</div>
          ) : globalActivityEvents.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No activity yet.</div>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              {globalActivityEvents.map((evt) => (
                <button
                  key={`${evt.id}-${evt.agentId}`}
                  type="button"
                  onClick={() => setSelectedAgentId(evt.agentId)}
                  className="w-full text-left px-5 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white" style={{ background: "#0a0a0a" }}>
                        {(evt.agentName || "A").charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground truncate">
                          <span className="font-medium text-foreground">{evt.agentName}</span>
                          {evt.agentCompanyEmail ? <span className="text-muted-foreground"> · {evt.agentCompanyEmail}</span> : null}
                        </p>
                        <p className="text-sm font-medium leading-snug">{formatEventLabel(evt)}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">{formatEventTime(evt.createdAt)}</p>
                      <div className="flex items-center justify-end gap-2 mt-2">
                        <StatusBadge status={evt.agentSubscriptionStatus} />
                        <StageBadge stage={evt.agentPipelineStage} />
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: "1px solid hsl(var(--border))" }}>
            <p className="text-xs text-muted-foreground">{globalActivityEvents.length ? `Showing ${globalActivityEvents.length} events` : "—"}</p>
            {globalEvents.hasNextPage ? (
              <button
                type="button"
                onClick={() => globalEvents.fetchNextPage()}
                disabled={globalEvents.isFetchingNextPage}
                className="text-xs font-semibold transition-opacity disabled:opacity-50"
                style={{ color: "hsl(43,85%,42%)" }}
              >
                {globalEvents.isFetchingNextPage ? "Loading..." : "Load more"}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">End of feed</span>
            )}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.25fr,0.95fr]">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
              <div>
                <h2 className="font-semibold text-sm tracking-wide">Agent Operations</h2>
                <p className="text-xs text-muted-foreground mt-1">{filteredAgents.length} visible records</p>
              </div>
              <Link href="/register">
                <button className="text-xs tracking-wide flex items-center gap-1 transition-colors hover:opacity-70" style={{ color: "hsl(43,85%,42%)" }}>
                  + Add New Agent <ChevronRight className="h-3 w-3" />
                </button>
              </Link>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading agents...</div>
            ) : filteredAgents.length === 0 ? (
              <div className="p-10 text-center">
                <img src={luxeLogo} alt="" className="h-12 w-12 rounded-lg object-cover mx-auto mb-3 opacity-30" />
                <p className="text-sm text-muted-foreground mb-2">No agents match the current filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted))" }}>
                      {["Agent", "CRM", "Status", "Current Stage", "Docs", "Onboarding", "Actions"].map((h) => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-medium text-muted-foreground tracking-widest uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.map((agent) => {
                      const pct = agent.onboardingComplete ? 100 : Math.round(((agent.onboardingStep - 1) / 6) * 100);
                      const isSelected = selectedAgentId === agent.id;
                      const emailRequestStatus = emailRequestIndex.get(agent.id)?.status ?? null;
                      const currentStage = deriveCurrentStage({
                        subscriptionStatus: agent.subscriptionStatus,
                        pipelineStage: agent.crmPipelineStage || "Applicant",
                        onboardingComplete: agent.onboardingComplete,
                        onboardingProgressPercent: pct,
                        emailRequestStatus,
                        companyEmail: agent.companyEmail,
                      });

                      return (
                        <tr key={agent.id} className={`border-b border-border last:border-0 transition-colors ${isSelected ? "bg-muted/40" : "hover:bg-muted/30"}`} data-testid={`row-agent-${agent.id}`}>
                          <td className="px-5 py-4">
                            <button className="text-left w-full" onClick={() => setSelectedAgentId(agent.id)}>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white" style={{ background: "#0a0a0a" }}>
                                  {agent.name.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-medium tracking-wide">{agent.name}</p>
                                  <p className="text-xs text-muted-foreground">{agent.personalEmail || agent.email || "—"}</p>
                                </div>
                              </div>
                            </button>
                          </td>
                          <td className="px-5 py-4">
                            <div className="text-xs">
                              <p className="font-medium">{agent.crmPipelineStage || "Applicant"}</p>
                              <p className="text-muted-foreground">{agent.crmRecordId || "Not linked"}</p>
                            </div>
                          </td>
                          <td className="px-5 py-4"><StatusBadge status={agent.subscriptionStatus} /></td>
                          <td className="px-5 py-4">
                            <CurrentStageBadge label={currentStage.label} variant={currentStage.variant} />
                          </td>
                          <td className="px-5 py-4"><span className="text-xs text-muted-foreground">{agent.payoutMethodType || "No payout"}</span></td>
                          <td className="px-5 py-4">
                            {agent.onboardingComplete ? (
                              <span className="flex items-center gap-1 text-xs" style={{ color: "hsl(43,85%,42%)" }}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                              </span>
                            ) : (
                              <div className="flex items-center gap-2 min-w-28">
                                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#eee" }}>
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, hsl(43,85%,45%), hsl(43,90%,58%))" }} />
                                </div>
                                <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <button onClick={() => setSelectedAgentId(agent.id)} className="text-xs tracking-wide hover:opacity-70 transition-colors" style={{ color: "hsl(43,85%,42%)" }}>
                                Manage
                              </button>
                              <Link href={`/onboarding/${agent.id}`}>
                                <button className="text-xs tracking-wide hover:opacity-70 transition-colors">View</button>
                              </Link>
                              {agent.subscriptionStatus !== "Active" && (
                                <button
                                  data-testid={`activate-agent-${agent.id}`}
                                  onClick={() => activateAgent(agent.id)}
                                  className="text-xs tracking-wide hover:opacity-70 transition-colors"
                                  style={{ color: "#0a0a0a", fontWeight: 600 }}
                                >
                                  Activate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
              <div>
                <h2 className="font-semibold text-sm tracking-wide">Agent Workspace</h2>
                <p className="text-xs text-muted-foreground mt-1">Review onboarding, approve docs, and link Luxe RM records</p>
              </div>
              {selectedAgentId && (
                <button
                  type="button"
                  onClick={() => {
                    qc.invalidateQueries({ queryKey: ["/api/admin/agents", selectedAgentId] });
                    qc.invalidateQueries({ queryKey: ["/api/admin/agents", selectedAgentId, "status"] });
                    qc.invalidateQueries({ queryKey: agentEventsKey });
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
              )}
            </div>

            {!selectedAgentId ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Select an agent to manage details.</div>
            ) : isDetailsLoading || !selectedAgentDetails ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading agent workspace...</div>
            ) : (
              <div className="p-5 space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                      {selectedAgentDetails.agent.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{selectedAgentDetails.agent.personalEmail || selectedAgentDetails.agent.email || "—"} · {selectedAgentDetails.agent.phone}</p>
                    {(() => {
                      const pipelineStage = selectedAgentStatus?.pipelineStage || selectedAgentDetails.agent.crmPipelineStage || "Applicant";
                      const onboardingComplete = selectedAgentStatus?.onboarding.complete ?? selectedAgentDetails.agent.onboardingComplete;
                      const onboardingProgressPercent = selectedAgentStatus?.onboarding.progressPercent ?? selectedAgentDetails.metrics.progressPercent;
                      const trainingCompleted = selectedAgentStatus?.training.completed ?? selectedAgentDetails.metrics.completedTrainingModules;
                      const trainingTotal = selectedAgentStatus?.training.total ?? (selectedAgentDetails.training.length || 5);
                      const emailRequestStatus = emailRequestIndex.get(selectedAgentDetails.agent.id)?.status ?? null;
                      const currentStage = deriveCurrentStage({
                        subscriptionStatus: selectedAgentDetails.agent.subscriptionStatus,
                        pipelineStage,
                        onboardingComplete,
                        onboardingProgressPercent,
                        trainingCompleted,
                        trainingTotal,
                        emailRequestStatus,
                        companyEmail: selectedAgentDetails.agent.companyEmail,
                      });

                      return (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <StatusBadge status={selectedAgentDetails.agent.subscriptionStatus} />
                          <StageBadge stage={pipelineStage} />
                          <CurrentStageBadge label={currentStage.label} variant={currentStage.variant} />
                        </div>
                      );
                    })()}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest">Onboarding</p>
                    <p className="text-2xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                      {selectedAgentDetails.metrics.progressPercent}%
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Start Date", value: formatDate(selectedAgentDetails.agent.startDate), icon: <BadgeCheck className="h-4 w-4 text-muted-foreground/50" /> },
                    { label: "Pending Docs", value: String(selectedAgentDetails.metrics.pendingDocs), icon: <FileText className="h-4 w-4 text-muted-foreground/50" /> },
                    { label: "Tasks Complete", value: `${selectedAgentDetails.metrics.completedTasks}/6`, icon: <CheckCircle2 className="h-4 w-4 text-muted-foreground/50" /> },
                    { label: "ICA", value: selectedAgentDetails.ica ? "Signed" : "Missing", icon: <ShieldCheck className="h-4 w-4 text-muted-foreground/50" /> },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs uppercase tracking-widest text-muted-foreground">{item.label}</span>
                        {item.icon}
                      </div>
                      <p className="text-sm font-medium">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-4 rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm tracking-wide">Admin Controls</h4>
                    <button onClick={() => saveAgent()} disabled={isSavingAgent} className="text-xs font-semibold transition-opacity disabled:opacity-50" style={{ color: "hsl(43,85%,42%)" }}>
                      Save Changes
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Subscription</span>
                      <select
                        value={editForm.subscriptionStatus}
                        onChange={(e) => setEditForm((current) => ({ ...current, subscriptionStatus: e.target.value }))}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="Trial">Trial</option>
                        <option value="Active">Active</option>
                        <option value="Paused">Paused</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">CRM Stage</span>
                      <select
                        value={editForm.crmPipelineStage}
                        onChange={(e) => {
                          const next = e.target.value;
                          setEditForm((current) => ({ ...current, crmPipelineStage: next }));
                          if (selectedAgentId) {
                            updatePipelineStage({ agentId: selectedAgentId, stage: next });
                          }
                        }}
                        disabled={isUpdatingStage}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
                      >
                        {PIPELINE_STAGES.map((stage) => (
                          <option key={stage} value={stage}>{stage}</option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">CRM Record ID</span>
                      <Input value={editForm.crmRecordId} onChange={(e) => setEditForm((current) => ({ ...current, crmRecordId: e.target.value }))} placeholder="Lead/contact ID in Luxe RM" />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">SoFi Status</span>
                      <select
                        value={editForm.sofiReferralStatus}
                        onChange={(e) => setEditForm((current) => ({ ...current, sofiReferralStatus: e.target.value }))}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {["Not Invited", "Invited", "Opened", "Bonus Confirmed", "Declined"].map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">SoFi Referral Link</span>
                      <Input
                        value={editForm.sofiReferralLink}
                        onChange={(e) => setEditForm((current) => ({ ...current, sofiReferralLink: e.target.value }))}
                        placeholder="https://www.sofi.com/invite/relay?..."
                      />
                      {editForm.sofiReferralLink ? (
                        <a
                          href={editForm.sofiReferralLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Open link →
                        </a>
                      ) : null}
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Payout Method</span>
                      <select
                        value={editForm.payoutMethodType}
                        onChange={(e) => setEditForm((current) => ({ ...current, payoutMethodType: e.target.value }))}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">Not set</option>
                        {["SoFi", "PayPal", "Bank Transfer", "Zelle"].map((method) => (
                          <option key={method} value={method}>{method}</option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Payout Details</span>
                      <Input value={editForm.payoutDetails} onChange={(e) => setEditForm((current) => ({ ...current, payoutDetails: e.target.value }))} placeholder="Account email, username, or last four digits" />
                    </label>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">Performance Notes</span>
                    <Textarea
                      value={editForm.performanceNotes}
                      onChange={(e) => setEditForm((current) => ({ ...current, performanceNotes: e.target.value }))}
                      placeholder="Coaching notes, performance issues, sales readiness, or compliance notes"
                      rows={4}
                    />
                  </label>
                </div>

                <div className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm tracking-wide">Timeline</h4>
                    <span className="text-xs text-muted-foreground">{agentTimelineEvents.length ? `${agentTimelineEvents.length} events` : "—"}</span>
                  </div>
                  {agentEvents.isLoading ? (
                    <div className="text-center text-sm text-muted-foreground py-6">Loading timeline...</div>
                  ) : agentTimelineEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No timeline events yet.</p>
                  ) : (
                    <div className="pl-3 border-l border-border space-y-3">
                      {agentTimelineEvents.map((evt) => (
                        <div key={evt.id} className="relative">
                          <div className="absolute -left-[13px] top-3 h-2 w-2 rounded-full" style={{ background: "hsl(43,85%,45%)" }} />
                          <div className="rounded-lg bg-muted/40 px-3 py-2">
                            <p className="text-sm font-medium">{formatEventLabel(evt)}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{formatEventTime(evt.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {agentEvents.hasNextPage ? (
                    <button
                      type="button"
                      onClick={() => agentEvents.fetchNextPage()}
                      disabled={agentEvents.isFetchingNextPage}
                      className="w-full rounded-md border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      {agentEvents.isFetchingNextPage ? "Loading more..." : "Load more"}
                    </button>
                  ) : null}
                </div>

                <div className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm tracking-wide">Onboarding Checklist</h4>
                    <span className="text-xs text-muted-foreground">{selectedAgentDetails.metrics.completedTasks} of 6 done</span>
                  </div>
                  <div className="space-y-2">
                    {selectedAgentDetails.tasks.map((task) => (
                      <div key={task.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium capitalize">{task.taskKey.replace("_", " ")}</p>
                          <p className="text-xs text-muted-foreground">Step {task.stepNumber}</p>
                        </div>
                        <TaskStatusBadge status={task.status} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm tracking-wide">Document Review</h4>
                    <span className="text-xs text-muted-foreground">{selectedAgentDetails.documents.length} files</span>
                  </div>

                  {selectedAgentDetails.documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedAgentDetails.documents.map((document) => (
                        <div key={document.id} className="rounded-lg border border-border p-3 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">{document.docType} · {document.fileName}</p>
                              <p className="text-xs text-muted-foreground">Uploaded {formatDate(document.uploadedAt)}</p>
                            </div>
                            <DocStatusBadge status={document.status} />
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateDocumentStatus({ documentId: document.id, status: "Approved" })}
                              disabled={isUpdatingDocument}
                              className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => updateDocumentStatus({ documentId: document.id, status: "Rejected" })}
                              disabled={isUpdatingDocument}
                              className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                            <a href={document.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground">
                              Open file
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm tracking-wide">Training + Compliance</h4>
                    <span className="text-xs text-muted-foreground">
                      {selectedAgentDetails.metrics.completedTrainingModules}/{selectedAgentDetails.training.length || 5} modules complete
                    </span>
                  </div>

                  <div className="space-y-2">
                    {selectedAgentDetails.training.map((module) => (
                      <div key={module.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{module.moduleName}</p>
                          <p className="text-xs text-muted-foreground">{module.moduleKey}</p>
                        </div>
                        <TaskStatusBadge status={module.completed ? "complete" : "pending"} />
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm font-medium mb-1">ICA Signature</p>
                    {selectedAgentDetails.ica ? (
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>{selectedAgentDetails.ica.legalName}</p>
                        <p>{selectedAgentDetails.ica.address}, {selectedAgentDetails.ica.city}, {selectedAgentDetails.ica.state} {selectedAgentDetails.ica.zip}</p>
                        <p>Signed {formatDate(selectedAgentDetails.ica.signedAt)}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No ICA on file yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden mt-6">
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
            <div>
              <h2 className="font-semibold text-sm tracking-wide">Email Requests</h2>
              <p className="text-xs text-muted-foreground mt-1">Provision Ocean Luxe inboxes and share temp passwords once</p>
            </div>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["/api/admin/email-requests"] })}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
          </div>

          {isLoadingEmailRequests ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading email requests...</div>
          ) : emailRequests.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No email requests yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted))" }}>
                    {["Agent", "Requested Email", "Status", "Created", "Actions"].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-medium text-muted-foreground tracking-widest uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {emailRequests.map((request) => {
                    const agent = agents.find((a) => a.id === request.agentId);
                    const localReveal = revealedPasswords[request.id] || "";
                    const revealedAt = (request.tempPasswordRevealedAt || "").trim();
                    const canReveal = !revealedAt && request.status !== "rejected";
                    const canResolve = request.status === "requested";

                    return (
                      <tr key={request.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-4">
                          <div className="text-xs">
                            <p className="font-medium">{agent?.name || `Agent #${request.agentId}`}</p>
                            <p className="text-muted-foreground">{agent?.email || ""}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-xs">
                            <p className="font-medium">{request.requestedEmail}</p>
                            {localReveal ? (
                              <p className="text-muted-foreground mt-1">Temp password: <span className="font-semibold text-foreground">{localReveal}</span></p>
                            ) : revealedAt ? (
                              <p className="text-muted-foreground mt-1">Temp password already revealed</p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize">
                            {request.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs text-muted-foreground">{formatDate(request.createdAt)}</span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => revealEmailPassword(request.id)}
                              disabled={!canReveal || isRevealingEmailPassword}
                              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                            >
                              Reveal once
                            </button>
                            <button
                              type="button"
                              onClick={() => updateEmailRequestStatus({ id: request.id, status: "created" })}
                              disabled={!canResolve || isUpdatingEmailRequestStatus}
                              className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                            >
                              Mark created
                            </button>
                            <button
                              type="button"
                              onClick={() => updateEmailRequestStatus({ id: request.id, status: "rejected" })}
                              disabled={!canResolve || isUpdatingEmailRequestStatus}
                              className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
