import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, RefreshCw } from "lucide-react";

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function statusBadge(ok: boolean | null) {
  if (ok === null) return <Badge variant="secondary">Unknown</Badge>;
  if (ok) return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">OK</Badge>;
  return <Badge variant="destructive">Down</Badge>;
}

async function fetchJsonOrText(url: string) {
  const res = await fetch(url, { credentials: "include" });
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, json };
  }
  const text = await res.text().catch(() => "");
  return { status: res.status, ok: res.ok, text };
}

export default function SystemHealthPage() {
  const healthz = useQuery({
    queryKey: ["/api/healthz"],
    queryFn: async () => fetchJsonOrText("/api/healthz"),
  });

  const diagnostics = useQuery({
    queryKey: ["/api/admin/auth/diagnostics"],
    queryFn: async () => fetchJsonOrText("/api/admin/auth/diagnostics"),
  });

  const deepAuth = useQuery({
    queryKey: ["/api/debug/auth"],
    queryFn: async () => fetchJsonOrText("/api/debug/auth"),
  });

  const dbOk = useMemo(() => {
    const payload = (healthz.data as any)?.json;
    if (payload && typeof payload === "object" && "dbOk" in payload) {
      return Boolean((payload as any).dbOk);
    }
    return null;
  }, [healthz.data]);

  const authMode = useMemo(() => {
    const payload = (diagnostics.data as any)?.json;
    const diag = payload && typeof payload === "object" ? (payload as any).diagnostics : null;
    return diag && typeof diag === "object" && typeof (diag as any).authMode === "string" ? (diag as any).authMode : null;
  }, [diagnostics.data]);

  const hasSessionCookie = useMemo(() => {
    const payload = (diagnostics.data as any)?.json;
    const diag = payload && typeof payload === "object" ? (payload as any).diagnostics : null;
    return diag && typeof diag === "object" && typeof (diag as any).hasSessionCookie === "boolean" ? (diag as any).hasSessionCookie : null;
  }, [diagnostics.data]);

  const refreshAll = () => {
    void healthz.refetch();
    void diagnostics.refetch();
    void deepAuth.refetch();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="ol-gradient ol-gold-line px-6 py-4 flex items-center gap-4">
        <Link href="/">
          <button className="text-white/50 hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div className="flex-1">
          <div className="text-white font-semibold tracking-wide">System Health</div>
          <div className="text-white/60 text-xs tracking-wide">Operational diagnostics for career.oceanluxe.org</div>
        </div>
        <Button variant="secondary" onClick={refreshAll} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Core</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Database</div>
                {statusBadge(dbOk)}
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Health Endpoint</div>
                <div className="text-sm font-medium">
                  {healthz.isLoading ? "Loading…" : typeof healthz.data?.status === "number" ? `HTTP ${healthz.data.status}` : "—"}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Auth</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Mode</div>
                <div className="text-sm font-medium">{authMode || (diagnostics.isLoading ? "Loading…" : "—")}</div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Session Cookie Present</div>
                {statusBadge(hasSessionCookie)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Raw Responses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">GET /api/healthz</div>
                <div className="text-xs text-muted-foreground">
                  {healthz.isFetching ? "Refreshing…" : typeof healthz.data?.status === "number" ? `HTTP ${healthz.data.status}` : ""}
                </div>
              </div>
              <pre className="rounded-md border border-border bg-muted/40 p-4 text-xs overflow-auto">{healthz.isLoading ? "Loading…" : formatJson(healthz.data)}</pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">GET /api/admin/auth/diagnostics</div>
                <div className="text-xs text-muted-foreground">
                  {diagnostics.isFetching ? "Refreshing…" : typeof diagnostics.data?.status === "number" ? `HTTP ${diagnostics.data.status}` : ""}
                </div>
              </div>
              <pre className="rounded-md border border-border bg-muted/40 p-4 text-xs overflow-auto">{diagnostics.isLoading ? "Loading…" : formatJson(diagnostics.data)}</pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">GET /api/debug/auth</div>
                <div className="text-xs text-muted-foreground">
                  {deepAuth.isFetching ? "Refreshing…" : typeof deepAuth.data?.status === "number" ? `HTTP ${deepAuth.data.status}` : ""}
                </div>
              </div>
              <pre className="rounded-md border border-border bg-muted/40 p-4 text-xs overflow-auto">{deepAuth.isLoading ? "Loading…" : formatJson(deepAuth.data)}</pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

