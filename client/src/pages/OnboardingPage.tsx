import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, Circle, Clock, ChevronRight, User, FileText,
  Upload, CreditCard, BookOpen, ArrowLeft, Loader2, Pen, Trash2
} from "lucide-react";
import type { Agent, OnboardingTask, TrainingProgress } from "@shared/schema";
import luxeLogo from "@assets/luxe-logo.jpg";

const STEPS = [
  { key: "profile", label: "Profile", icon: User, n: 1 },
  { key: "ica", label: "Sign ICA", icon: Pen, n: 2 },
  { key: "w9", label: "W-9 Upload", icon: FileText, n: 3 },
  { key: "id_upload", label: "ID Verify", icon: Upload, n: 4 },
  { key: "payout", label: "Payout Setup", icon: CreditCard, n: 5 },
  { key: "training", label: "Training", icon: BookOpen, n: 6 },
];

const TRAINING_MODULES = [
  { key: "intro", name: "Welcome to Ocean Luxe", duration: "3 min" },
  { key: "cold_calling", name: "Cold Calling Mastery", duration: "8 min" },
  { key: "objections", name: "Handling Objections", duration: "6 min" },
  { key: "deal_analysis", name: "Deal Analysis & ARV", duration: "7 min" },
  { key: "crm_walkthrough", name: "CRM Walkthrough", duration: "5 min" },
];

function StepIcon({ status }: { status: string }) {
  if (status === "complete") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "in_progress") return <Clock className="h-4 w-4 text-amber-500" />;
  return <Circle className="h-4 w-4 text-muted-foreground/40" />;
}

// ── ICA Step ─────────────────────────────────────────────────────────────────
function ICAStep({ agentId, agent, onComplete }: { agentId: number; agent: Agent; onComplete: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [signed, setSigned] = useState(false);
  const [form, setForm] = useState({ legalName: agent.name, address: "", city: "", state: "", zip: "", agreed: false });

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    setSigned(true);
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = "hsl(220,70%,20%)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    setDrawing(true);
  };

  const clearSig = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSigned(false);
  };

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const sig = canvasRef.current!.toDataURL("image/png");
      await apiRequest("POST", `/api/agents/${agentId}/ica`, {
        ...form, agentId, signatureDataUrl: sig, agreed: true,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents", agentId, "onboarding"] });
      toast({ title: "ICA Signed!", description: "Your Independent Contractor Agreement has been recorded." });
      onComplete();
    },
    onError: () => toast({ title: "Error", description: "Could not save signature.", variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <div className="bg-muted/50 border border-border rounded-xl p-4 text-sm text-muted-foreground max-h-48 overflow-y-auto leading-relaxed">
        <p className="font-semibold text-foreground mb-2">Independent Contractor Agreement</p>
        <p>This Independent Contractor Agreement ("Agreement") is entered into between <strong>Ocean Luxe Estate LLC</strong> ("Company") and the undersigned agent ("Contractor").</p>
        <p className="mt-2"><strong>1. Services.</strong> Contractor agrees to perform real estate acquisition services including cold calling, lead qualification, and deal procurement on a commission-only basis.</p>
        <p className="mt-2"><strong>2. Compensation.</strong> Contractor shall receive a commission per closed deal as defined in the commission schedule provided separately. No guaranteed income is implied.</p>
        <p className="mt-2"><strong>3. Platform Fee.</strong> Contractor agrees to pay $50/month for access to Ocean Luxe tools, training, and resources. This fee is non-refundable after billing.</p>
        <p className="mt-2"><strong>4. Independent Contractor Status.</strong> Contractor is not an employee of Company. Contractor is responsible for their own taxes (1099) and business expenses.</p>
        <p className="mt-2"><strong>5. Term.</strong> This agreement is month-to-month and may be terminated by either party with 30 days written notice.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5 col-span-2">
          <Label>Legal Name</Label>
          <Input value={form.legalName} onChange={e => setForm(f => ({ ...f, legalName: e.target.value }))} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>Street Address</Label>
          <Input placeholder="123 Main St" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input placeholder="Orlando" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>State</Label>
            <Input placeholder="FL" maxLength={2} value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))} />
          </div>
          <div className="space-y-1.5">
            <Label>ZIP</Label>
            <Input placeholder="32801" value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Your Signature</Label>
          <button onClick={clearSig} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors">
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        </div>
        <div className="border-2 border-dashed border-border rounded-xl overflow-hidden bg-white dark:bg-slate-900">
          <canvas
            ref={canvasRef}
            id="signature-canvas"
            width={500}
            height={120}
            className="w-full"
            data-testid="signature-canvas"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={() => setDrawing(false)}
            onMouseLeave={() => setDrawing(false)}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={() => setDrawing(false)}
          />
        </div>
        {!signed && <p className="text-xs text-muted-foreground">Draw your signature above using your mouse or finger.</p>}
      </div>

      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          id="agreed"
          data-testid="checkbox-agreed"
          checked={form.agreed}
          onChange={e => setForm(f => ({ ...f, agreed: e.target.checked }))}
          className="mt-0.5 accent-primary"
        />
        <label htmlFor="agreed" className="text-sm text-muted-foreground cursor-pointer">
          I have read and agree to the Independent Contractor Agreement above, and confirm this digital signature is legally binding.
        </label>
      </div>

      <button
        data-testid="btn-sign-ica"
        onClick={() => mutate()}
        disabled={!signed || !form.agreed || !form.address || isPending}
        className="w-full py-2.5 rounded-md font-semibold tracking-wide transition-all disabled:opacity-50"
      style={{ background: "#0a0a0a", color: "hsl(43,85%,52%)" }}
      >
        {isPending ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Signing...</span> : "Sign Agreement & Continue →"}
      </button>
    </div>
  );
}

// ── Document Upload Step ───────────────────────────────────────────────────────
function DocumentUploadStep({
  agentId, docType, label, description, onComplete
}: { agentId: number; docType: string; label: string; description: string; onComplete: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = ev => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  };

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/agents/${agentId}/documents`, {
        docType,
        fileName: file!.name,
        fileUrl: `/uploads/${file!.name}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents", agentId, "onboarding"] });
      toast({ title: `${label} uploaded!`, description: "Document submitted for review." });
      onComplete();
    },
    onError: () => toast({ title: "Upload failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
        <Upload className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-sm font-medium mb-1">Click to upload your {label}</p>
        <p className="text-xs text-muted-foreground mb-4">PDF, JPG, PNG accepted · Max 10MB</p>
        <input
          type="file"
          id={`upload-${docType}`}
          data-testid={`upload-${docType}`}
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={handleFile}
        />
        <label htmlFor={`upload-${docType}`}>
          <Button variant="outline" size="sm" className="cursor-pointer" asChild>
            <span>Choose File</span>
          </Button>
        </label>
      </div>
      {file && (
        <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
        </div>
      )}
      {preview && (
        <img src={preview} alt="Preview" className="rounded-lg border border-border max-h-40 object-contain mx-auto" />
      )}
      <Button
        data-testid={`btn-upload-${docType}`}
        onClick={() => mutate()}
        disabled={!file || isPending}
        className="w-full"
      >
        {isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Uploading...</> : `Submit ${label} →`}
      </Button>
    </div>
  );
}

// ── Payout Step ───────────────────────────────────────────────────────────────
function PayoutStep({ agentId, onComplete }: { agentId: number; onComplete: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [method, setMethod] = useState("");
  const [details, setDetails] = useState("");
  const [sofi, setSofi] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/agents/${agentId}/payout`, {
        payoutMethodType: method,
        payoutDetails: details,
        sofiReferralStatus: sofi ? "Invited" : "Declined",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents", agentId, "onboarding"] });
      toast({ title: "Payout method saved!", description: "You're all set for commission payments." });
      onComplete();
    },
    onError: () => toast({ title: "Error saving payout", variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Choose how you'd like to receive your commission payouts. Fast payouts are processed within 48 hours of deal closing.</p>

      <div className="space-y-2">
        <Label>Payout Method</Label>
        <div className="grid grid-cols-2 gap-2">
          {["SoFi", "PayPal", "Bank Transfer", "Zelle"].map(m => (
            <button
              key={m}
              data-testid={`payout-${m.toLowerCase().replace(" ", "-")}`}
              onClick={() => setMethod(m)}
              className={`border rounded-xl p-3 text-sm font-medium transition-all ${
                method === m
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-primary/40"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {method && (
        <div className="space-y-1.5">
          <Label>
            {method === "SoFi" ? "SoFi Account Email" :
             method === "PayPal" ? "PayPal Email or Username" :
             method === "Zelle" ? "Zelle Phone or Email" :
             "Bank Account (last 4 digits only — not your full number)"}
          </Label>
          <Input
            data-testid="input-payout-details"
            placeholder={method === "Bank Transfer" ? "e.g. •••• 4521" : "Enter your account info"}
            value={details}
            onChange={e => setDetails(e.target.value)}
          />
        </div>
      )}

      {/* SoFi referral offer */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Recommended: SoFi Checking & Savings</p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
          Ocean Luxe recommends SoFi for the fastest payouts. Opening a SoFi account via our referral link may qualify you for a bank bonus (eligibility depends on SoFi's current offer).
        </p>
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="sofi-opt"
            data-testid="checkbox-sofi"
            checked={sofi}
            onChange={e => setSofi(e.target.checked)}
            className="mt-0.5 accent-amber-500"
          />
          <label htmlFor="sofi-opt" className="text-xs text-amber-700 dark:text-amber-400 cursor-pointer">
            Yes, I'd like to receive the SoFi referral link (optional — choosing a different method will not affect my pay)
          </label>
        </div>
      </div>

      <Button
        data-testid="btn-save-payout"
        onClick={() => mutate()}
        disabled={!method || !details || isPending}
        className="w-full"
      >
        {isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : "Save Payout Method →"}
      </Button>
    </div>
  );
}

// ── Training Step ──────────────────────────────────────────────────────────────
function TrainingStep({ agentId, onComplete }: { agentId: number; onComplete: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: progress = [] } = useQuery<TrainingProgress[]>({
    queryKey: ["/api/agents", agentId, "training"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/agents/${agentId}/training`);
      return res.json();
    },
  });

  const { mutate: completeModule } = useMutation({
    mutationFn: async (moduleKey: string) => {
      await apiRequest("POST", `/api/agents/${agentId}/training/${moduleKey}/complete`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents", agentId, "training"] });
      qc.invalidateQueries({ queryKey: ["/api/agents", agentId, "onboarding"] });
    },
  });

  const allDone = progress.length > 0 && progress.every(m => m.completed);
  const doneCount = progress.filter(m => m.completed).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Complete all 5 training modules to finish onboarding.</p>
        <Badge variant="outline">{doneCount}/{TRAINING_MODULES.length}</Badge>
      </div>

      <Progress value={(doneCount / TRAINING_MODULES.length) * 100} className="h-2" />

      <div className="space-y-2">
        {TRAINING_MODULES.map(mod => {
          const done = progress.find(p => p.moduleKey === mod.key)?.completed;
          return (
            <div
              key={mod.key}
              className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                done ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" : "bg-card border-border"
              }`}
            >
              <div className="flex items-center gap-3">
                {done
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  : <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                }
                <div>
                  <p className="text-sm font-medium">{mod.name}</p>
                  <p className="text-xs text-muted-foreground">{mod.duration}</p>
                </div>
              </div>
              {!done && (
                <button
                  data-testid={`btn-complete-${mod.key}`}
                  onClick={() => {
                    completeModule(mod.key);
                    toast({ title: `${mod.name} completed!` });
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Mark Complete
                </button>
              )}
            </div>
          );
        })}
      </div>

      {allDone && (
        <Button data-testid="btn-finish-training" onClick={onComplete} className="w-full bg-emerald-600 hover:bg-emerald-700">
          <CheckCircle2 className="h-4 w-4 mr-2" /> Finish Onboarding →
        </Button>
      )}
    </div>
  );
}

// ── Main Onboarding Page ──────────────────────────────────────────────────────
export default function OnboardingPage() {
  const { id } = useParams<{ id: string }>();
  const agentId = Number(id);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: agent, isLoading: agentLoading } = useQuery<Agent>({
    queryKey: ["/api/agents", agentId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/agents/${agentId}`);
      return res.json();
    },
  });

  const { data: tasks = [] } = useQuery<OnboardingTask[]>({
    queryKey: ["/api/agents", agentId, "onboarding"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/agents/${agentId}/onboarding`);
      return res.json();
    },
  });

  const getTask = (key: string) => tasks.find(t => t.taskKey === key);
  const completedCount = tasks.filter(t => t.status === "complete").length;
  const progressPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  const currentStep = STEPS.find(s => {
    const t = getTask(s.key);
    return t?.status === "in_progress";
  }) || STEPS.find(s => getTask(s.key)?.status === "pending") || STEPS[STEPS.length - 1];

  const [activeStep, setActiveStep] = useState<string>(currentStep?.key || "profile");

  useEffect(() => {
    if (currentStep) setActiveStep(currentStep.key);
  }, [tasks.length]);

  const handleStepComplete = () => {
    qc.invalidateQueries({ queryKey: ["/api/agents", agentId] });
    qc.invalidateQueries({ queryKey: ["/api/agents", agentId, "onboarding"] });
    const currentIdx = STEPS.findIndex(s => s.key === activeStep);
    const nextStep = STEPS[currentIdx + 1];
    if (nextStep) {
      setActiveStep(nextStep.key);
    } else {
      toast({ title: "Onboarding Complete!", description: "Welcome to the Ocean Luxe team." });
      navigate("/");
    }
  };

  if (agentLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Agent not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="ol-gradient text-white md:w-72 md:min-h-screen flex flex-col shrink-0">
        {/* Logo + user */}
        <div className="p-5 ol-gold-line">
          <div className="flex items-center gap-2.5">
            <img src={luxeLogo} alt="Ocean Luxe" className="h-8 w-8 rounded-md object-cover" />
            <div className="flex flex-col leading-none gap-0.5">
              <span className="text-sm font-semibold tracking-widest text-white" style={{ fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.12em" }}>OCEAN LUXE</span>
              <span className="text-[8px] tracking-[0.22em] uppercase" style={{ color: "hsl(43,85%,52%)" }}>Estate LLC</span>
            </div>
          </div>
        </div>
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 text-white" style={{ background: "#0a0a0a", border: "1px solid rgba(212,168,45,0.4)" }}>
              {agent.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{agent.name}</p>
              <p className="text-xs text-white/50 truncate">{agent.email}</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-white/60">Onboarding Progress</span>
              <span className="font-semibold" style={{ color: "hsl(43,85%,52%)" }}>{progressPercent}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  background: "linear-gradient(90deg, hsl(43,85%,45%), hsl(43,90%,58%))",
                  width: `${progressPercent}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Steps nav */}
        <nav className="flex-1 p-4 space-y-1">
          {STEPS.map(step => {
            const task = getTask(step.key);
            const status = task?.status || "pending";
            const isActive = activeStep === step.key;
            const StepIco = step.icon;
            return (
              <button
                key={step.key}
                data-testid={`nav-step-${step.key}`}
                onClick={() => setActiveStep(step.key)}
                style={isActive ? { background: "rgba(212,168,45,0.12)", borderLeft: "2px solid hsl(43,85%,52%)" } : {}}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                  isActive
                    ? "text-white font-medium" : status === "complete"
                    ? "hover:bg-white/5"
                    : "text-white/50 hover:bg-white/5 hover:text-white/80"
                }`}
              >
                <StepIco className="h-4 w-4 shrink-0" />
                <span className="flex-1">{step.label}</span>
                <StepIcon status={status} />
              </button>
            );
          })}
        </nav>

        {agent.onboardingComplete && (
          <div className="p-4 border-t border-white/10">
            <div className="rounded-lg p-3 text-center" style={{ background: "rgba(212,168,45,0.12)", border: "1px solid rgba(212,168,45,0.3)" }}>
              <CheckCircle2 className="h-5 w-5 mx-auto mb-1" style={{ color: "hsl(43,85%,52%)" }} />
              <p className="text-xs font-medium" style={{ color: "hsl(43,85%,52%)" }}>Onboarding Complete!</p>
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="border-b border-border px-6 py-4 flex items-center gap-4 bg-card">
          <div>
            <h1 className="text-base font-semibold">
              Step {STEPS.findIndex(s => s.key === activeStep) + 1} of {STEPS.length}:&nbsp;
              {STEPS.find(s => s.key === activeStep)?.label}
            </h1>
            <p className="text-xs text-muted-foreground">{completedCount} of {STEPS.length} steps complete</p>
          </div>
          <div className="ml-auto">
            <Badge
              variant="outline"
              className={`text-xs ${
                agent.subscriptionStatus === "Active" ? "border-emerald-500 text-emerald-600" :
                "border-amber-500 text-amber-600"
              }`}
            >
              {agent.subscriptionStatus}
            </Badge>
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 p-6 md:p-8 max-w-2xl w-full mx-auto">
          <div className="bg-card border border-border rounded-2xl p-6 md:p-8">

            {activeStep === "profile" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Your profile has been created. Review your info below.</p>
                <div className="space-y-3">
                  {[
                    { label: "Full Name", value: agent.name },
                    { label: "Email", value: agent.email },
                    { label: "Phone", value: agent.phone },
                    { label: "Start Date", value: new Date(agent.startDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) },
                    { label: "Status", value: agent.subscriptionStatus },
                  ].map(f => (
                    <div key={f.label} className="flex justify-between py-2 border-b border-border last:border-0">
                      <span className="text-sm text-muted-foreground">{f.label}</span>
                      <span className="text-sm font-medium">{f.value}</span>
                    </div>
                  ))}
                </div>
                <button
                  data-testid="btn-confirm-profile"
                  className="w-full mt-2 py-2.5 rounded-md font-semibold tracking-wide transition-all"
                  style={{ background: "#0a0a0a", color: "hsl(43,85%,52%)" }}
                  onClick={() => {
                    qc.invalidateQueries({ queryKey: ["/api/agents", agentId, "onboarding"] });
                    apiRequest("PATCH", `/api/agents/${agentId}/onboarding/profile`, { status: "complete" }).then(() => {
                      handleStepComplete();
                    });
                  }}
>
                  Profile Looks Good — Continue →
                </button>
              </div>
            )}

            {activeStep === "ica" && (
              <ICAStep agentId={agentId} agent={agent} onComplete={handleStepComplete} />
            )}

            {activeStep === "w9" && (
              <DocumentUploadStep
                agentId={agentId}
                docType="W9"
                label="W-9 Form"
                description="Upload your completed IRS W-9 form. This is required for contractor tax reporting. Download a blank W-9 at irs.gov/pub/irs-pdf/fw9.pdf, fill it out, and upload it here."
                onComplete={handleStepComplete}
              />
            )}

            {activeStep === "id_upload" && (
              <DocumentUploadStep
                agentId={agentId}
                docType="ID"
                label="Government-Issued ID"
                description="Upload a clear photo or scan of your driver's license, state ID, or passport. This is used to verify your identity as a contractor with Ocean Luxe Estate LLC."
                onComplete={handleStepComplete}
              />
            )}

            {activeStep === "payout" && (
              <PayoutStep agentId={agentId} onComplete={handleStepComplete} />
            )}

            {activeStep === "training" && (
              <TrainingStep agentId={agentId} onComplete={handleStepComplete} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
