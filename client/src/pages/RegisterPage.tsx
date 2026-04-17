import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";
import luxeLogo from "@assets/luxe-logo.jpg";

const OceanLuxeLogo = () => (
  <div className="flex items-center gap-2.5" aria-label="Ocean Luxe Estate LLC">
    <img src={luxeLogo} alt="Ocean Luxe shell logo" className="h-8 w-8 rounded-md object-cover" />
    <div className="flex flex-col leading-none gap-0.5">
      <span className="text-sm font-semibold tracking-widest text-white" style={{ fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.12em" }}>
        OCEAN LUXE
      </span>
      <span className="text-[8px] tracking-[0.22em] uppercase" style={{ color: "hsl(43,85%,52%)" }}>
        Estate LLC
      </span>
    </div>
  </div>
);

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", phone: "" });

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/agents", data);
      return res.json();
    },
    onSuccess: (agent) => {
      toast({ title: "Welcome to Ocean Luxe!", description: "Your agent profile has been created." });
      navigate("/agent");
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.phone) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    mutate(form);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="ol-gradient ol-gold-line px-6 py-4 flex items-center gap-4">
        <Link href="/">
          <button className="text-white/50 hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <OceanLuxeLogo />
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <img
              src={luxeLogo}
              alt="Ocean Luxe"
              className="h-16 w-16 rounded-xl object-cover mx-auto mb-5"
              style={{ boxShadow: "0 0 30px rgba(212,168,45,0.2)" }}
            />
            <h1 className="text-2xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Create your agent profile</h1>
            <p className="text-muted-foreground text-sm mt-1.5 tracking-wide">Step 1 of 6 — takes about 2 minutes</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="tracking-wide text-xs uppercase text-muted-foreground">Full Legal Name <span className="text-destructive">*</span></Label>
              <Input
                id="name"
                data-testid="input-name"
                placeholder="e.g. Giovanna Davis"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="tracking-wide text-xs uppercase text-muted-foreground">Email Address <span className="text-destructive">*</span></Label>
              <Input
                id="email"
                type="email"
                data-testid="input-email"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="tracking-wide text-xs uppercase text-muted-foreground">Phone Number <span className="text-destructive">*</span></Label>
              <Input
                id="phone"
                type="tel"
                data-testid="input-phone"
                placeholder="(555) 000-0000"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                required
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                data-testid="btn-register"
                disabled={isPending}
                className="w-full py-3 rounded-md font-semibold tracking-wide transition-all disabled:opacity-50"
                style={{ background: "#0a0a0a", color: "hsl(43,85%,52%)" }}
              >
                {isPending ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating profile...</span>
                ) : (
                  "Continue to Onboarding →"
                )}
              </button>
            </div>

            <p className="text-xs text-muted-foreground text-center pt-1 tracking-wide">
              By continuing, you agree to Ocean Luxe's contractor terms and $50/month platform fee.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
