import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, OnboardingTask } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import luxeLogo from "@assets/luxe-logo.jpg";
import { ArrowLeft, CheckCircle2, Circle, Clock, LogOut } from "lucide-react";

const STEPS = [
  { key: "profile", label: "Profile", n: 1 },
  { key: "ica", label: "Sign ICA", n: 2 },
  { key: "w9", label: "W-9 Upload", n: 3 },
  { key: "id_upload", label: "ID Verify", n: 4 },
  { key: "payout", label: "Payout Setup", n: 5 },
  { key: "training", label: "Training", n: 6 },
];

function StepStatusIcon({ status }: { status: string }) {
  if (status === "complete") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "in_progress") return <Clock className="h-4 w-4 text-amber-500" />;
  return <Circle className="h-4 w-4 text-muted-foreground/40" />;
}

export default function AgentDashboardPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [loginForm, setLoginForm] = useState({ email: "", phoneLast4: "" });

  const { data, isLoading, isError, error } = useQuery<{ agent: Agent; tasks: OnboardingTask[] }>({
    queryKey: ["/api/agent/me"],
    queryFn: async () => {
      const res = await fetch("/api/agent/me", { credentials: "include" });
      if (res.status === 401) {
        const e = new Error("unauthorized");
        (e as any).status = 401;
        throw e;
      }
      if (!res.ok) {
        throw new Error(`Failed to load agent session: ${res.status}`);
      }
      return res.json();
    },
    retry: false,
  });

  const agent = data?.agent ?? null;
  const tasks = data?.tasks ?? [];
  const unauthorized = isError && (error as any)?.status === 401;

  const progress = useMemo(() => {
    const completed = tasks.filter((t) => t.status === "complete").length;
    const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
    const current = tasks.find((t) => t.status === "in_progress") || tasks.find((t) => t.status === "pending") || null;
    return { completed, percent, current };
  }, [tasks]);

  const { mutate: login, isPending: isLoggingIn } = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agent/login", {
        email: loginForm.email.trim().toLowerCase(),
        phoneLast4: loginForm.phoneLast4.trim(),
      });
      return res.json();
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/agent/me"] });
    },
  });

  const { mutate: logout } = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/agent/logout", {});
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/agent/me"] });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-xl px-6 py-5 text-sm text-muted-foreground">
          Loading your dashboard...
        </div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <nav className="ol-gradient ol-gold-line px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <button className="text-white/50 hover:text-white transition-colors"><ArrowLeft className="h-5 w-5" /></button>
            </Link>
            <div className="flex items-center gap-2.5" aria-label="Ocean Luxe Estate LLC">
              <img src={luxeLogo} alt="Ocean Luxe shell logo" className="h-8 w-8 rounded-md object-cover" />
              <div className="flex flex-col leading-none gap-0.5">
                <span className="text-sm font-semibold tracking-widest text-white" style={{ fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.12em" }}>
                  OCEAN LUXE
                </span>
                <span className="text-[8px] tracking-[0.22em] uppercase" style={{ color: "hsl(43,85%,52%)" }}>Estate LLC</span>
              </div>
            </div>
          </div>
          <span className="text-xs tracking-widest uppercase px-3 py-1 rounded-full border inline-flex" style={{ borderColor: "rgba(212,168,45,0.3)", color: "hsl(43,85%,52%)" }}>
            Agent Portal
          </span>
        </nav>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 space-y-5">
            <div className="text-center space-y-2">
              <img src={luxeLogo} alt="Ocean Luxe" className="h-14 w-14 rounded-xl object-cover mx-auto" />
              <h1 className="text-2xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Agent Sign-In</h1>
              <p className="text-sm text-muted-foreground">Enter your email and the last 4 digits of your phone number.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={loginForm.email} onChange={(e) => setLoginForm((v) => ({ ...v, email: e.target.value }))} placeholder="you@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone last 4</Label>
                <Input
                  inputMode="numeric"
                  value={loginForm.phoneLast4}
                  onChange={(e) => setLoginForm((v) => ({ ...v, phoneLast4: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                  placeholder="4521"
                />
              </div>
              <Button className="w-full" onClick={() => login()} disabled={!loginForm.email.trim() || loginForm.phoneLast4.trim().length !== 4 || isLoggingIn}>
                Sign In →
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-xl px-6 py-5 text-sm text-muted-foreground">
          Could not load agent profile.
        </div>
      </div>
    );
  }

  const resumeHref = `/onboarding/${agent.id}`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="ol-gradient ol-gold-line px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <button className="text-white/50 hover:text-white transition-colors"><ArrowLeft className="h-5 w-5" /></button>
          </Link>
          <div className="flex items-center gap-2.5" aria-label="Ocean Luxe Estate LLC">
            <img src={luxeLogo} alt="Ocean Luxe shell logo" className="h-8 w-8 rounded-md object-cover" />
            <div className="flex flex-col leading-none gap-0.5">
              <span className="text-sm font-semibold tracking-widest text-white" style={{ fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.12em" }}>
                OCEAN LUXE
              </span>
              <span className="text-[8px] tracking-[0.22em] uppercase" style={{ color: "hsl(43,85%,52%)" }}>Estate LLC</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => logout()} className="text-white/70 hover:text-white text-xs font-semibold tracking-wide inline-flex items-center gap-2">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </nav>

      <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Agent Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1.5">{agent.name} · {agent.email}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Onboarding Progress</p>
                <p className="text-2xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{progress.percent}%</p>
              </div>
              <Button onClick={() => navigate(resumeHref)} style={{ background: "#0a0a0a", color: "hsl(43,85%,52%)" }}>
                Resume Onboarding →
              </Button>
            </div>

            <div className="space-y-2">
              {STEPS.map((step) => {
                const t = tasks.find((x) => x.taskKey === step.key);
                const status = t?.status || "pending";
                return (
                  <div key={step.key} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{step.n}. {step.label}</p>
                      <p className="text-xs text-muted-foreground">{status.replace("_", " ")}</p>
                    </div>
                    <StepStatusIcon status={status} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5 space-y-2">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Quick Links</p>
              <a href={resumeHref} className="text-sm font-semibold hover:underline" style={{ color: "hsl(43,85%,42%)" }}>
                Open onboarding →
              </a>
              <a href={`/training/training-bundle.html?agentId=${agent.id}`} target="_blank" rel="noreferrer" className="text-sm font-semibold hover:underline" style={{ color: "hsl(43,85%,42%)" }}>
                Open training →
              </a>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Current Step</p>
              <p className="text-sm font-medium">
                {progress.current ? `${progress.current.stepNumber}. ${progress.current.taskKey.replace("_", " ")}` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {progress.current ? "Resume onboarding to continue where you left off." : "Your onboarding steps will appear here."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

