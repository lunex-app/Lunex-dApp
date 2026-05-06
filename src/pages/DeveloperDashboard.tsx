import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Key, BarChart3, Shield, ShieldOff, Copy, Check, LogOut,
  Plus, BookOpen, Inbox, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import BackButton from "@/components/BackButton";
import SDKDeveloperGuide, { AVAILABLE_SERVICES } from "@/components/SDKDeveloperGuide";

interface ApiKey {
  id: string;
  key_value: string;
  label: string;
  is_active: boolean;
  created_at: string;
  revoked_at: string | null;
  allowed_services?: string[];
}

interface UsageStats {
  total_requests: number;
  rate_limited: number;
  by_endpoint: Record<string, number>;
  by_status: Record<string, number>;
  recent: any[];
}

interface KeyRequest {
  id: string;
  label: string;
  requested_services: string[];
  status: string;
  admin_note: string | null;
  created_at: string;
}

const DeveloperDashboard = () => {
  const { user, session, signOut } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"keys" | "analytics" | "request" | "docs">("keys");
  const [days, setDays] = useState(7);
  const [requests, setRequests] = useState<KeyRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Request form
  const [reqLabel, setReqLabel] = useState("");
  const [reqServices, setReqServices] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState("");

  const callAdmin = useCallback(async (action: string, method: string, body?: any, params?: Record<string, string>) => {
    const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dex-admin`);
    url.searchParams.set("action", action);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return res.json();
  }, [session]);

  const loadKeys = useCallback(async () => {
    const data = await callAdmin("my-keys", "GET");
    setKeys(data.keys || []);
    setLoading(false);
  }, [callAdmin]);

  const loadUsage = useCallback(async () => {
    const data = await callAdmin("my-usage", "GET", undefined, { days: String(days) });
    setUsage(data);
  }, [callAdmin, days]);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    const data = await callAdmin("my-requests", "GET");
    setRequests(data.requests || []);
    setRequestsLoading(false);
  }, [callAdmin]);

  useEffect(() => { loadKeys(); }, [loadKeys]);
  useEffect(() => { if (tab === "analytics") loadUsage(); }, [tab, loadUsage]);
  useEffect(() => { if (tab === "request") loadRequests(); }, [tab, loadRequests]);

  const copyKey = (id: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleService = (id: string) => {
    setReqServices(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const submitRequest = async () => {
    if (!reqLabel.trim() || reqServices.length === 0) return;
    setSubmitting(true);
    setSubmitSuccess("");
    const data = await callAdmin("submit-request", "POST", { label: reqLabel, requested_services: reqServices });
    if (data.error) {
      setSubmitSuccess(`Error: ${data.error}`);
    } else {
      setSubmitSuccess("Request submitted! An admin will review it shortly.");
      setReqLabel("");
      setReqServices([]);
      await loadRequests();
    }
    setSubmitting(false);
  };

  const revokeKey = async (id: string) => { await callAdmin("dev-revoke", "PUT", { id }); await loadKeys(); };
  const reactivateKey = async (id: string) => { await callAdmin("dev-reactivate", "PUT", { id }); await loadKeys(); };
  const deleteKey = async (id: string) => { await callAdmin("dev-delete", "DELETE", undefined, { id }); await loadKeys(); };

  return (
    <div className="container max-w-4xl mx-auto py-16 px-4">
      <BackButton />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight">Developer Portal</h1>
          <p className="text-[10px] text-muted-foreground tracking-wider uppercase mt-1">Your API Keys & Usage</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={signOut}><LogOut className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="flex gap-px bg-border mb-6 flex-wrap">
        {([
          { id: "keys" as const, label: "My Keys", icon: Key },
          { id: "request" as const, label: "Request Key", icon: Plus },
          { id: "analytics" as const, label: "Usage", icon: BarChart3 },
          { id: "docs" as const, label: "Dev Guide", icon: BookOpen },
        ]).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] sm:text-xs font-semibold tracking-wider uppercase transition-colors ${tab === id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* My Keys */}
      {tab === "keys" && (
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : keys.length === 0 ? (
            <div className="border border-border bg-card p-8 text-center">
              <Key className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-xs text-muted-foreground tracking-wider uppercase mb-2">No API keys assigned to you yet</p>
              <p className="text-xs text-muted-foreground mb-4">Submit a request in the "Request Key" tab to get started.</p>
              <Button size="sm" onClick={() => setTab("request")}><Plus className="h-3 w-3 mr-1" /> Request API Key</Button>
            </div>
          ) : (
            keys.map((key) => (
              <div key={key.id} className={`border bg-card p-4 ${key.is_active ? "border-border" : "border-destructive/30 opacity-60"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {key.is_active ? <Shield className="h-3.5 w-3.5 text-green-500" /> : <ShieldOff className="h-3.5 w-3.5 text-destructive" />}
                    <span className="text-sm font-semibold">{key.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 tracking-wider uppercase font-semibold ${key.is_active ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"}`}>
                      {key.is_active ? "Active" : "Paused"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => copyKey(key.id, key.key_value)} className="h-7 px-2">
                      {copiedId === key.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    {key.is_active ? (
                      <Button variant="ghost" size="sm" onClick={() => revokeKey(key.id)} className="h-7 px-2 text-yellow-500 hover:text-yellow-500" title="Pause key"><ShieldOff className="h-3.5 w-3.5" /></Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => reactivateKey(key.id)} className="h-7 px-2 text-green-500 hover:text-green-500" title="Resume key"><Shield className="h-3.5 w-3.5" /></Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => deleteKey(key.id)} className="h-7 px-2 text-destructive hover:text-destructive" title="Delete key">
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <code className="text-xs font-mono text-muted-foreground bg-muted/30 px-2 py-1 block overflow-hidden text-ellipsis">{key.key_value}</code>
                {key.allowed_services && key.allowed_services.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {key.allowed_services.map(s => (
                      <span key={s} className="text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary font-semibold tracking-wider uppercase">{s}</span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-2 tracking-wider">Created {new Date(key.created_at).toLocaleDateString()}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Request Key */}
      {tab === "request" && (
        <div className="space-y-4">
          <div className="border border-border bg-card p-4">
            <h3 className="text-xs font-semibold tracking-wider uppercase mb-3">Request a New API Key</h3>
            <p className="text-[10px] text-muted-foreground mb-4">Select the services you need. An admin will review and approve your request.</p>
            <div className="space-y-3">
              <Input value={reqLabel} onChange={(e) => setReqLabel(e.target.value)} placeholder="Project name / label" />
              <div>
                <p className="text-[10px] text-muted-foreground tracking-wider uppercase mb-2">Select Services</p>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_SERVICES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => toggleService(s.id)}
                      className={`px-2.5 py-1.5 text-[10px] font-semibold tracking-wider uppercase border transition-colors ${
                        reqServices.includes(s.id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:border-foreground"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 space-y-1">
                  {AVAILABLE_SERVICES.filter(s => reqServices.includes(s.id)).map(s => (
                    <p key={s.id} className="text-[10px] text-muted-foreground">• <strong>{s.label}:</strong> {s.description}</p>
                  ))}
                </div>
              </div>
              <Button onClick={submitRequest} disabled={submitting || !reqLabel.trim() || reqServices.length === 0} size="sm">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Inbox className="h-4 w-4 mr-1" />}
                Submit Request
              </Button>
              {submitSuccess && <p className={`text-xs ${submitSuccess.startsWith("Error") ? "text-destructive" : "text-green-500"}`}>{submitSuccess}</p>}
            </div>
          </div>

          {/* Previous requests */}
          <div className="border border-border bg-card p-4">
            <h3 className="text-xs font-semibold tracking-wider uppercase mb-3">Your Requests</h3>
            {requestsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary mx-auto" />
            ) : requests.length === 0 ? (
              <p className="text-xs text-muted-foreground">No requests submitted yet.</p>
            ) : (
              <div className="space-y-2">
                {requests.map(req => (
                  <div key={req.id} className="border border-border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold">{req.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 tracking-wider uppercase font-semibold ${
                        req.status === "pending" ? "bg-yellow-500/10 text-yellow-500" :
                        req.status === "approved" ? "bg-green-500/10 text-green-500" :
                        "bg-destructive/10 text-destructive"
                      }`}>
                        {req.status === "pending" && <Clock className="h-2.5 w-2.5 inline mr-0.5" />}
                        {req.status === "approved" && <CheckCircle2 className="h-2.5 w-2.5 inline mr-0.5" />}
                        {req.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-1">
                      {req.requested_services.map(s => (
                        <span key={s} className="text-[9px] px-1 py-0.5 bg-primary/10 text-primary tracking-wider uppercase">{s}</span>
                      ))}
                    </div>
                    {req.admin_note && <p className="text-[10px] text-muted-foreground italic">Admin: {req.admin_note}</p>}
                    <p className="text-[10px] text-muted-foreground tracking-wider">{new Date(req.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Usage */}
      {tab === "analytics" && (
        <div className="space-y-4">
          <div className="border border-border bg-card p-4 flex gap-3 items-center">
            <div>
              <label className="text-[10px] text-muted-foreground tracking-wider uppercase block mb-1">Time Range</label>
              <div className="flex gap-px bg-border">
                {[1, 7, 30].map((d) => (
                  <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 text-xs font-semibold ${days === d ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>{d}d</button>
                ))}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={loadUsage} className="mt-4">Refresh</Button>
          </div>
          {!usage ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
                {[
                  { label: "Total Requests", value: usage.total_requests },
                  { label: "Rate Limited", value: usage.rate_limited, color: "text-destructive" },
                  { label: "Success Rate", value: `${usage.total_requests > 0 ? ((1 - (usage.by_status["500"] || 0) / usage.total_requests) * 100).toFixed(1) : "100"}%`, color: "text-green-500" },
                  { label: "Endpoints", value: Object.keys(usage.by_endpoint).length },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-4 bg-card">
                    <p className="text-[10px] text-muted-foreground tracking-wider uppercase">{label}</p>
                    <p className={`text-2xl font-bold font-mono ${color || ""}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="border border-border bg-card p-4">
                <h3 className="text-xs font-semibold tracking-wider uppercase mb-3">Requests by Endpoint</h3>
                {Object.keys(usage.by_endpoint).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No data for this period</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(usage.by_endpoint).sort(([, a], [, b]) => b - a).map(([endpoint, count]) => {
                      const pct = usage.total_requests > 0 ? (count / usage.total_requests) * 100 : 0;
                      return (
                        <div key={endpoint}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-mono">{endpoint}</span>
                            <span className="text-muted-foreground">{count} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full bg-muted/30 h-1.5"><div className="bg-primary h-1.5" style={{ width: `${pct}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Dev Guide */}
      {tab === "docs" && <SDKDeveloperGuide />}
    </div>
  );
};

export default DeveloperDashboard;
