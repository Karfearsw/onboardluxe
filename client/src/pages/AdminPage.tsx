import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { Users, DollarSign, CheckCircle2, TrendingUp, ChevronRight, ArrowLeft } from "lucide-react";
import type { Agent } from "@shared/schema";
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
  total: number; active: number; trial: number; complete: number;
  mrr: number; goal: number; mrrPercent: number;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, React.CSSProperties> = {
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

export default function AdminPage() {
  const qc = useQueryClient();

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    queryFn: async () => (await apiRequest("GET", "/api/stats")).json(),
  });

  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    queryFn: async () => (await apiRequest("GET", "/api/agents")).json(),
  });

  const { mutate: activateAgent } = useMutation({
    mutationFn: async (agentId: number) => apiRequest("PATCH", `/api/agents/${agentId}`, { subscriptionStatus: "Active" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/agents"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <nav className="ol-gradient ol-gold-line px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <button className="text-white/50 hover:text-white transition-colors"><ArrowLeft className="h-5 w-5" /></button>
          </Link>
          <OceanLuxeLogo />
        </div>
        <span className="text-xs tracking-widest uppercase px-3 py-1 rounded-full border" style={{ borderColor: "rgba(212,168,45,0.3)", color: "hsl(43,85%,52%)" }}>
          Admin Panel
        </span>
      </nav>

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Hiring Dashboard</h1>
          <p className="text-sm text-muted-foreground tracking-wide mt-0.5">Ocean Luxe Estate LLC — Agent Management</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total Agents", value: stats.total, sub: "of 100 goal", icon: <Users className="h-4 w-4 text-muted-foreground/40" />, testid: "stat-total" },
              { label: "Active ($50/mo)", value: stats.active, sub: `${stats.trial} on trial`, icon: <CheckCircle2 className="h-4 w-4 text-muted-foreground/40" />, testid: "stat-active", gold: true },
              { label: "Monthly Revenue", value: `$${stats.mrr.toLocaleString()}`, sub: `$${(stats.goal - stats.mrr).toLocaleString()} to $5K`, icon: <DollarSign className="h-4 w-4 text-muted-foreground/40" />, testid: "stat-mrr", gold: true },
              { label: "Goal Progress", value: `${stats.mrrPercent}%`, sub: null, icon: <TrendingUp className="h-4 w-4 text-muted-foreground/40" />, testid: "stat-mrr-pct" },
            ].map(card => (
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

        {/* MRR goal bar */}
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

        {/* Agents table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
            <h2 className="font-semibold text-sm tracking-wide">All Agents</h2>
            <Link href="/register">
              <button className="text-xs tracking-wide flex items-center gap-1 transition-colors hover:opacity-70" style={{ color: "hsl(43,85%,42%)" }}>
                + Add New Agent <ChevronRight className="h-3 w-3" />
              </button>
            </Link>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading agents...</div>
          ) : agents.length === 0 ? (
            <div className="p-10 text-center">
              <img src={luxeLogo} alt="" className="h-12 w-12 rounded-lg object-cover mx-auto mb-3 opacity-30" />
              <p className="text-sm text-muted-foreground mb-2">No agents yet.</p>
              <Link href="/register">
                <button className="text-sm tracking-wide hover:opacity-70 transition-colors" style={{ color: "hsl(43,85%,42%)" }}>Register first agent →</button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted))" }}>
                    {["Agent", "Status", "Payout", "SoFi", "Onboarding", "Actions"].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-medium text-muted-foreground tracking-widest uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agents.map(agent => {
                    const pct = Math.round(((agent.onboardingStep - 1) / 6) * 100);
                    return (
                      <tr key={agent.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-agent-${agent.id}`}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white" style={{ background: "#0a0a0a" }}>
                              {agent.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium tracking-wide">{agent.name}</p>
                              <p className="text-xs text-muted-foreground">{agent.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4"><StatusBadge status={agent.subscriptionStatus} /></td>
                        <td className="px-5 py-4"><span className="text-xs text-muted-foreground">{agent.payoutMethodType || "—"}</span></td>
                        <td className="px-5 py-4">
                          <span className="text-xs" style={{ color: agent.sofiReferralStatus === "Bonus Confirmed" ? "hsl(43,85%,40%)" : agent.sofiReferralStatus === "Invited" ? "hsl(43,85%,50%)" : undefined }}>
                            {agent.sofiReferralStatus}
                          </span>
                        </td>
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
                            <Link href={`/onboarding/${agent.id}`}>
                              <button className="text-xs tracking-wide hover:opacity-70 transition-colors" style={{ color: "hsl(43,85%,42%)" }} data-testid={`view-onboarding-${agent.id}`}>
                                View
                              </button>
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
      </div>
    </div>
  );
}
