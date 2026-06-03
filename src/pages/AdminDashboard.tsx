import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Key, BarChart3, Plus, Check,
  Trash2, LogOut, Users, X, BookOpen, Inbox,
  Hammer, AlertTriangle
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import BackButton from "@/components/BackButton";
import SDKDeveloperGuide, { AVAILABLE_SERVICES } from "@/components/SDKDeveloperGuide";

interface ApiKey {
  id: string;
  key_value?: string;
  display_key?: string;
  key_prefix?: string;
  key_last4?: string;
  label: string;
  is_active: boolean;
  created_at: string;
  revoked_at: string | null;
  created_by?: string;
  allowed_services?: string[];
}

interface UsageStats {
  total_requests: number;
  rate_limited: number;
  by_endpoint: Record<string, number>;
  by_status: Record<string, number>;
  recent: any[];
}

interface ProtocolOverview {
  registered_users: number;
  user_counts: {
    daily: number;
    weekly: number;
    monthly: number;
    total: number;
  };
  volume: {
    daily: number;
    weekly: number;
    monthly: number;
    total: number;
  };
  wallet_addresses: Array<{
    address: string;
    interactions: number;
    last_seen: string | null;
    source: string;
  }>;
}

interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  roles: string[];
}

interface KeyRequest {
  id: string;
  requested_by: string;
  label: string;
  requested_services: string[];
  status: string;
  admin_note: string | null;
  created_at: string;
  requester_email?: string;
  requester_name?: string;
}

const ROLE_INFO: Record<string, { label: string; color: string; description: string }> = {
  admin: {
    label: "Admin",
    color: "bg-red-500/10 text-red-500",
    description: "Full access. Manages all API keys, usage analytics, user roles, and key requests. Can approve or deny API key requests from developers.",
  },
  developer: {
    label: "Developer",
    color: "bg-blue-500/10 text-blue-500",
    description: "SDK integrator. Can request API keys with specific service scopes, view their own keys and usage analytics. Cannot manage other users.",
  },
  user: {
    label: "User",
    color: "bg-muted text-muted-foreground",
    description: "Basic account. Can log in and view profile. No API key or analytics access. Default role for new sign-ups before being granted higher access.",
  },
};

const ADMIN_WALLETS = [
  "0x66CF9CA9D75FD62438C6E254bA35E61775EF9496", // Primary Admin
];

const AdminDashboard = () => {
  const { user, session, signOut, isAdmin: isEmailAdmin } = useAuth();
  const { address } = useAccount();
  const isAdmin = isEmailAdmin || (address && ADMIN_WALLETS.some(a => a.toLowerCase() === address.toLowerCase()));
  
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [overview, setOverview] = useState<ProtocolOverview | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newServices, setNewServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"keys" | "analytics" | "users" | "requests" | "maintenance" | "docs">("keys");
  const [days, setDays] = useState(7);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roleAssigning, setRoleAssigning] = useState<string | null>(null);
  const [requests, setRequests] = useState<KeyRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  
  // Maintenance State (Pivoting to Local State for Preview)
  const [protocolSettings, setProtocolSettings] = useState<any[]>([
    { key: "maintenance_all", value: false },
    { key: "maintenance_swap", value: false },
    { key: "maintenance_bridge", value: false },
    { key: "maintenance_yield", value: false },
    { key: "maintenance_pool", value: false },
  ]);

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
    const data = await callAdmin("list", "GET");
    setKeys(data.keys || []);
    setLoading(false);
  }, [callAdmin]);

  const loadUsage = useCallback(async () => {
    const params: Record<string, string> = { days: String(days) };
    if (selectedKeyId) params.key_id = selectedKeyId;
    const data = await callAdmin("usage", "GET", undefined, params);
    setUsage(data);
  }, [callAdmin, selectedKeyId, days]);

  const loadOverview = useCallback(async () => {
    const data = await callAdmin("protocol-overview", "GET");
    setOverview(data);
  }, [callAdmin]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    const data = await callAdmin("users", "GET");
    setUsers(data.users || []);
    setUsersLoading(false);
  }, [callAdmin]);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    const data = await callAdmin("list-requests", "GET");
    setRequests(data.requests || []);
    setRequestsLoading(false);
  }, [callAdmin]);

  const loadProtocolSettingsFromDB = useCallback(async () => {
    let settings = [
      { key: "maintenance_all", value: localStorage.getItem("maintenance_all") === "true" },
      { key: "maintenance_swap", value: localStorage.getItem("maintenance_swap") === "true" },
      { key: "maintenance_bridge", value: localStorage.getItem("maintenance_bridge") === "true" },
      { key: "maintenance_yield", value: localStorage.getItem("maintenance_yield") === "true" },
      { key: "maintenance_pool", value: localStorage.getItem("maintenance_pool") === "true" },
    ];
    setProtocolSettings(settings);

    try {
      const { data, error } = await supabase.from("protocol_settings" as any).select("*");
      if (!error && data && data.length > 0) {
        settings = settings.map(s => {
           const dbVal = data.find(d => d.key === s.key);
           return dbVal ? { ...s, value: dbVal.value === true || dbVal.value === "true" } : s;
        });
        setProtocolSettings(settings);
      }
    } catch (e) {
      console.log("Database table protocol_settings not found, using local preview state.");
    }
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);
  useEffect(() => { if (tab === "analytics") { loadUsage(); loadOverview(); } }, [tab, loadUsage, loadOverview]);
  useEffect(() => { if (tab === "users") loadUsers(); }, [tab, loadUsers]);
  useEffect(() => { if (tab === "requests") loadRequests(); }, [tab, loadRequests]);
  useEffect(() => { if (tab === "maintenance") loadProtocolSettingsFromDB(); }, [tab, loadProtocolSettingsFromDB]);

  const toggleService = (id: string) => {
    setNewServices(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const createKey = async () => {
    if (!newLabel.trim() || newServices.length === 0) return;
    setCreating(true);
    await callAdmin("create", "POST", { label: newLabel, allowed_services: newServices });
    setNewLabel("");
    setNewServices([]);
    await loadKeys();
    setCreating(false);
  };

  const revokeKey = async (id: string) => { await callAdmin("revoke", "PUT", { id }); await loadKeys(); };
  const reactivateKey = async (id: string) => { await callAdmin("reactivate", "PUT", { id }); await loadKeys(); };
  const deleteKey = async (id: string) => { await callAdmin("delete-key", "DELETE", undefined, { id }); await loadKeys(); };

  const copyKey = (id: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const assignRole = async (userId: string, role: string) => {
    setRoleAssigning(userId + role);
    await callAdmin("assign-role", "POST", { user_id: userId, role });
    await loadUsers();
    setRoleAssigning(null);
  };

  const removeRole = async (userId: string, role: string) => {
    setRoleAssigning(userId + role);
    await callAdmin("remove-role", "DELETE", undefined, { user_id: userId, role });
    await loadUsers();
    setRoleAssigning(null);
  };

  const handleRequest = async (requestId: string, action: "approve" | "deny", note?: string) => {
    await callAdmin("handle-request", "POST", { request_id: requestId, action, admin_note: note });
    await loadRequests();
    if (action === "approve") await loadKeys();
  };

  const toggleProtocolSetting = async (key: string, currentValue: any) => {
    const newValue = !currentValue;
    // Optimistically update UI
    setProtocolSettings(prev => prev.map(s => s.key === key ? { ...s, value: newValue } : s));
    
    // Set in localStorage and trigger event so app reacts immediately
    localStorage.setItem(key, newValue ? "true" : "false");
    window.dispatchEvent(new Event("maintenance_change"));

    // Attempt DB push but don't error out if table missing (no migration required for preview)
    const { error } = await supabase.from("protocol_settings" as any).upsert({ key, value: newValue });
    if (!error) {
      toast.success(`${key.replace("maintenance_", "").toUpperCase()} state updated`);
    } else {
      toast.info(`${key.replace("maintenance_", "").toUpperCase()} changed (Local Preview only)`);
    }
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;
  const fmtUsd = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (!isAdmin) {
    return (
      <div className="container max-w-md mx-auto py-16">
        <BackButton />
        <h1 className="text-3xl font-bold uppercase tracking-tight mb-2">Access Denied</h1>
        <p className="text-xs text-muted-foreground mb-4">You do not have administrative access.</p>
        <Button variant="outline" size="sm" onClick={signOut}><LogOut className="h-3.5 w-3.5 mr-1.5" /> Sign Out</Button>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-16 px-4">
      <BackButton />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight">Lunex SDK</h1>
          <p className="text-[10px] text-muted-foreground tracking-wider uppercase mt-1">Admin Dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={signOut}><LogOut className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="flex gap-px bg-border mb-6 flex-wrap">
        {[
          { id: "keys" as const, label: "API Keys", icon: Key },
          { id: "requests" as const, label: "Requests", icon: Inbox, badge: pendingCount },
          { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
          { id: "users" as const, label: "Users", icon: Users },
          { id: "maintenance" as const, label: "Protocol", icon: Hammer },
          { id: "docs" as const, label: "Dev Guide", icon: BookOpen },
        ].map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] sm:text-xs font-semibold tracking-wider uppercase transition-colors relative ${
              tab === id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
            {badge ? (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">{badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "keys" && (
        <div className="space-y-4">
          <div className="border border-border bg-card p-4">
            <h3 className="text-xs font-semibold tracking-wider uppercase mb-3">Generate API Key</h3>
            <div className="space-y-3">
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Key label" />
              <Button onClick={createKey} disabled={creating || !newLabel.trim()} size="sm">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Generate
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {keys.map((key) => (
              <div key={key.id} className="border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">{key.label}</span>
                  <Button variant="ghost" size="sm" onClick={() => deleteKey(key.id)} className="h-7 px-2 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                <code className="text-[10px] font-mono text-muted-foreground">{key.key_value || key.display_key || `${key.key_prefix || "lnx_****"}...${key.key_last4 || "****"}`}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-4">
          {usersLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center border border-border bg-card text-muted-foreground text-sm">No users found.</div>
          ) : (
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-sm">{u.email}</div>
                    <div className="text-xs text-muted-foreground">Joined: {new Date(u.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="flex gap-2">
                    {["admin", "developer", "user"].map(role => (
                      <Button
                        key={role}
                        size="sm"
                        variant={u.roles.includes(role) ? "default" : "outline"}
                        onClick={() => u.roles.includes(role) ? removeRole(u.id, role) : assignRole(u.id, role)}
                        disabled={roleAssigning === u.id + role}
                        className="text-[10px] uppercase h-7 px-2"
                      >
                        {roleAssigning === u.id + role ? <Loader2 className="h-3 w-3 animate-spin" /> : role}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "requests" && (
        <div className="space-y-4">
          {requestsLoading ? (
            <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center border border-border bg-card text-muted-foreground text-sm">No API key requests.</div>
          ) : (
            <div className="space-y-2">
              {requests.map(r => (
                <div key={r.id} className="border border-border bg-card p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-sm">{r.label}</div>
                      <div className="text-xs text-muted-foreground">{r.requester_email || r.requested_by}</div>
                    </div>
                    <div className={`text-[10px] font-bold uppercase px-2 py-1 rounded-sm ${
                      r.status === "pending" ? "bg-yellow-500/10 text-yellow-500" :
                      r.status === "approved" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                    }`}>
                      {r.status}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {r.requested_services.map(s => (
                      <span key={s} className="bg-primary/10 text-primary text-[9px] uppercase px-1.5 py-0.5 rounded-sm">{s}</span>
                    ))}
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-2 pt-2 border-t border-border">
                      <Button size="sm" onClick={() => handleRequest(r.id, "approve")} className="h-7 text-xs bg-green-500 hover:bg-green-600 text-white"><Check className="h-3 w-3 mr-1" /> Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleRequest(r.id, "deny")} className="h-7 text-xs"><X className="h-3 w-3 mr-1" /> Deny</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "analytics" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 border border-border bg-card">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Users</div>
              <div className="text-2xl font-bold">{overview?.registered_users || 0}</div>
            </div>
            <div className="p-4 border border-border bg-card">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">API Requests</div>
              <div className="text-2xl font-bold">{usage?.total_requests || 0}</div>
            </div>
            <div className="p-4 border border-border bg-card">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Rate Limited</div>
              <div className="text-2xl font-bold text-yellow-500">{usage?.rate_limited || 0}</div>
            </div>
            <div className="p-4 border border-border bg-card">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Vol (7d)</div>
              <div className="text-2xl font-bold">${fmtUsd(overview?.volume?.weekly || 0)}</div>
            </div>
          </div>
          
          <div className="border border-border bg-card p-4">
             <h3 className="text-sm font-bold uppercase mb-4">API Usage by Endpoint</h3>
             {usage?.by_endpoint && Object.keys(usage.by_endpoint).length > 0 ? (
               <div className="space-y-2">
                 {Object.entries(usage.by_endpoint).map(([endpoint, count]) => (
                   <div key={endpoint} className="flex justify-between items-center text-sm">
                     <span className="font-mono text-muted-foreground">{endpoint}</span>
                     <span className="font-bold">{count}</span>
                   </div>
                 ))}
               </div>
             ) : (
               <div className="text-sm text-muted-foreground text-center py-4">No API usage recorded in this period.</div>
             )}
          </div>
        </div>
      )}

      {tab === "maintenance" && (
        <div className="space-y-6">
           <div className="flex items-center justify-between gap-4">
              <div>
                 <h3 className="text-sm font-bold uppercase">Consensus Control</h3>
                 <p className="text-[10px] text-muted-foreground uppercase">Enable/Disable protocol modules (Preview Mode)</p>
              </div>
           </div>
           
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {protocolSettings.map(s => (
                <div key={s.key} className="p-4 border border-border bg-card rounded-sm flex items-center justify-between">
                   <span className="text-[10px] font-bold uppercase tracking-widest">{s.key.replace("maintenance_", "")}</span>
                   <Switch 
                    checked={s.value === true}
                    onCheckedChange={() => toggleProtocolSetting(s.key, s.value)}
                   />
                </div>
              ))}
           </div>
           
           <div className="p-4 bg-muted/30 border border-border flex items-start gap-4">
              <AlertTriangle className="h-4 w-4 text-primary mt-1" />
              <p className="text-[10px] text-muted-foreground leading-relaxed font-mono">
                NOTICE: You are currently using the Protocol Maintenance panel in **Preview Mode**. 
                Your toggles will affect your current session for testing. Permanent protocol blocking requires a database schema sync which has been omitted per your instructions.
              </p>
           </div>
        </div>
      )}

      {tab === "docs" && <SDKDeveloperGuide />}
    </div>
  );
};

export default AdminDashboard;
