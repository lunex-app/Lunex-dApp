import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const LUNEX_CONTRACTS = [
  "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8",
  "0x66CF9CA9D75FD62438C6E254bA35E61775EF9496",
  "0xcF2C839B12ECf6D9eEcd4607521B73fcFb7E8713",
];

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "";
  for (let i = 0; i < 32; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  return "lnx_" + key;
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function maskApiKey(row: any) {
  const prefix = row.key_prefix || (row.key_value ? String(row.key_value).slice(0, 8) : "lnx_****");
  const last4 = row.key_last4 || (row.key_value ? String(row.key_value).slice(-4) : "****");
  return {
    ...row,
    key_value: undefined,
    key_hash: undefined,
    key_prefix: prefix,
    key_last4: last4,
    display_key: `${prefix}...${last4}`,
  };
}

async function buildApiKeyInsert(keyValue: string, fields: Record<string, unknown>) {
  return {
    ...fields,
    key_hash: await sha256Hex(keyValue),
    key_prefix: keyValue.slice(0, 8),
    key_last4: keyValue.slice(-4),
  };
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: roles } = await adminClient.from("user_roles").select("role").eq("user_id", user.id);
  const userRoles = (roles || []).map((r: any) => r.role);
  const isAdmin = userRoles.includes("admin");
  const isDeveloper = userRoles.includes("developer");

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    // ========== DEVELOPER + ADMIN ENDPOINTS ==========

    // MY KEYS
    if (req.method === "GET" && action === "my-keys") {
      if (!isAdmin && !isDeveloper) return json({ error: "Forbidden" }, 403);
      const { data } = await adminClient.from("dex_api_keys")
        .select("id, label, is_active, created_at, revoked_at, allowed_services, key_prefix, key_last4")
        .eq("created_by", user.id).order("created_at", { ascending: false });
      return json({ keys: (data || []).map(maskApiKey) });
    }

    // MY USAGE
    if (req.method === "GET" && action === "my-usage") {
      if (!isAdmin && !isDeveloper) return json({ error: "Forbidden" }, 403);
      const days = parseInt(url.searchParams.get("days") || "7");
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data: myKeys } = await adminClient.from("dex_api_keys").select("id").eq("created_by", user.id);
      const keyIds = (myKeys || []).map((k: any) => k.id);
      if (keyIds.length === 0) return json({ total_requests: 0, rate_limited: 0, by_endpoint: {}, by_status: {}, recent: [] });
      const { data } = await adminClient.from("dex_api_usage").select("*").in("api_key_id", keyIds).gte("created_at", since).order("created_at", { ascending: false }).limit(1000);
      return json(buildUsageStats(data));
    }

    // MY REQUESTS (developer sees their own)
    if (req.method === "GET" && action === "my-requests") {
      if (!isAdmin && !isDeveloper) return json({ error: "Forbidden" }, 403);
      const { data } = await adminClient.from("dex_api_key_requests")
        .select("*").eq("requested_by", user.id).order("created_at", { ascending: false });
      return json({ requests: data });
    }

    // SUBMIT REQUEST (developer/user submits a key request)
    if (req.method === "POST" && action === "submit-request") {
      if (!isAdmin && !isDeveloper) return json({ error: "Forbidden: need developer role" }, 403);
      const body = await req.json();
      const { label, requested_services } = body;
      if (!label || !requested_services?.length) return json({ error: "label and requested_services required" }, 400);
      const { data, error } = await adminClient.from("dex_api_key_requests")
        .insert({ requested_by: user.id, label, requested_services }).select().single();
      if (error) throw error;
      return json({ request: data }, 201);
    }

    // DEV KEY MANAGEMENT (pause/resume/delete own keys)
    if (req.method === "PUT" && action === "dev-revoke") {
      if (!isAdmin && !isDeveloper) return json({ error: "Forbidden" }, 403);
      const { id } = await req.json();
      const { error } = await adminClient.from("dex_api_keys")
        .update({ is_active: false, revoked_at: new Date().toISOString() })
        .eq("id", id).eq("created_by", user.id);
      if (error) throw error;
      return json({ success: true });
    }
    if (req.method === "PUT" && action === "dev-reactivate") {
      if (!isAdmin && !isDeveloper) return json({ error: "Forbidden" }, 403);
      const { id } = await req.json();
      const { error } = await adminClient.from("dex_api_keys")
        .update({ is_active: true, revoked_at: null })
        .eq("id", id).eq("created_by", user.id);
      if (error) throw error;
      return json({ success: true });
    }
    if (req.method === "DELETE" && action === "dev-delete") {
      if (!isAdmin && !isDeveloper) return json({ error: "Forbidden" }, 403);
      const id = url.searchParams.get("id");
      const { error } = await adminClient.from("dex_api_keys").delete().eq("id", id).eq("created_by", user.id);
      if (error) throw error;
      return json({ success: true });
    }

    // ========== ADMIN-ONLY ENDPOINTS ==========
    if (!isAdmin) return json({ error: "Forbidden: admin role required" }, 403);

    // LIST all keys
    if (req.method === "GET" && action === "list") {
      const { data } = await adminClient.from("dex_api_keys")
        .select("id, label, is_active, created_at, revoked_at, created_by, allowed_services, key_prefix, key_last4")
        .order("created_at", { ascending: false });
      return json({ keys: (data || []).map(maskApiKey) });
    }

    // USAGE analytics
    if (req.method === "GET" && action === "usage") {
      const keyId = url.searchParams.get("key_id");
      const days = parseInt(url.searchParams.get("days") || "7");
      const since = new Date(Date.now() - days * 86400000).toISOString();
      let query = adminClient.from("dex_api_usage").select("*").gte("created_at", since).order("created_at", { ascending: false });
      if (keyId) query = query.eq("api_key_id", keyId);
      const { data } = await query.limit(1000);
      return json(buildUsageStats(data));
    }

    if (req.method === "GET" && action === "protocol-overview") {
      const [profilesRes, volumeRes, chainWallets] = await Promise.all([
        adminClient.from("profiles").select("id", { count: "exact", head: true }),
        adminClient.from("protocol_volume").select("amount_usd, timestamp").order("timestamp", { ascending: false }).limit(1000),
        fetchOnchainWalletActivity(),
      ]);

      const now = Date.now();
      const dayMs = 86400000;
      const weekMs = 7 * dayMs;
      const monthMs = 30 * dayMs;

      const allActivity = chainWallets;

      const countDistinctSince = (windowMs: number) => new Set(
        allActivity.filter((row) => row.timestamp >= now - windowMs).map((row) => row.address)
      ).size;

      const volumeRows = (volumeRes.data || []).map((row: any) => ({
        amount: Number(row.amount_usd || 0),
        timestamp: new Date(row.timestamp).getTime(),
      }));
      const sumVolumeSince = (windowMs: number) => volumeRows
        .filter((row) => row.timestamp >= now - windowMs)
        .reduce((sum, row) => sum + row.amount, 0);

      const walletMap = new Map<string, { address: string; interactions: number; last_seen: string | null; sources: Set<string> }>();

      for (const row of allActivity) {
        const existing = walletMap.get(row.address) || {
          address: row.address,
          interactions: 0,
          last_seen: null,
          sources: new Set<string>(),
        };
        existing.interactions += 1;
        existing.sources.add(row.source);
        const iso = new Date(row.timestamp).toISOString();
        if (!existing.last_seen || iso > existing.last_seen) existing.last_seen = iso;
        walletMap.set(row.address, existing);
      }

      const wallet_addresses = Array.from(walletMap.values())
        .sort((a, b) => (b.last_seen || "").localeCompare(a.last_seen || "") || b.interactions - a.interactions)
        .slice(0, 250)
        .map((row) => ({
          address: row.address,
          interactions: row.interactions,
          last_seen: row.last_seen,
          source: Array.from(row.sources).join(", "),
        }));

      return json({
        registered_users: profilesRes.count || 0,
        user_counts: {
          daily: countDistinctSince(dayMs),
          weekly: countDistinctSince(weekMs),
          monthly: countDistinctSince(monthMs),
          total: new Set(allActivity.map((row) => row.address)).size,
        },
        volume: {
          daily: sumVolumeSince(dayMs),
          weekly: sumVolumeSince(weekMs),
          monthly: sumVolumeSince(monthMs),
          total: volumeRows.reduce((sum, row) => sum + row.amount, 0),
        },
        wallet_addresses,
      });
    }

    // LIST all users
    if (req.method === "GET" && action === "users") {
      const { data: profiles } = await adminClient.from("profiles").select("id, email, display_name, created_at").order("created_at", { ascending: false });
      const { data: allRoles } = await adminClient.from("user_roles").select("user_id, role");
      const roleMap: Record<string, string[]> = {};
      for (const r of allRoles || []) { if (!roleMap[r.user_id]) roleMap[r.user_id] = []; roleMap[r.user_id].push(r.role); }
      const users = (profiles || []).map((p: any) => ({ ...p, roles: roleMap[p.id] || [] }));
      return json({ users });
    }

    // LIST all key requests (admin)
    if (req.method === "GET" && action === "list-requests") {
      const { data } = await adminClient.from("dex_api_key_requests").select("*").order("created_at", { ascending: false });
      // Enrich with requester info
      const userIds = [...new Set((data || []).map((r: any) => r.requested_by))];
      const { data: profiles } = await adminClient.from("profiles").select("id, email, display_name").in("id", userIds);
      const profileMap: Record<string, any> = {};
      for (const p of profiles || []) profileMap[p.id] = p;
      const enriched = (data || []).map((r: any) => ({
        ...r,
        requester_email: profileMap[r.requested_by]?.email,
        requester_name: profileMap[r.requested_by]?.display_name,
      }));
      return json({ requests: enriched });
    }

    // HANDLE REQUEST (approve/deny)
    if (req.method === "POST" && action === "handle-request") {
      const body = await req.json();
      const { request_id, action: reqAction, admin_note } = body;
      if (!request_id || !reqAction) return json({ error: "request_id and action required" }, 400);
      if (!["approve", "deny"].includes(reqAction)) return json({ error: "action must be approve or deny" }, 400);

      // Get the request
      const { data: reqData, error: reqErr } = await adminClient.from("dex_api_key_requests")
        .select("*").eq("id", request_id).single();
      if (reqErr || !reqData) return json({ error: "Request not found" }, 404);
      if (reqData.status !== "pending") return json({ error: "Request already processed" }, 400);

      if (reqAction === "approve") {
        // Generate key and assign to requester
        const keyValue = generateApiKey();
        await adminClient.from("dex_api_keys").insert(await buildApiKeyInsert(keyValue, {
          label: reqData.label,
          created_by: reqData.requested_by,
          allowed_services: reqData.requested_services,
        }));
      }

      await adminClient.from("dex_api_key_requests").update({
        status: reqAction === "approve" ? "approved" : "denied",
        admin_note: admin_note || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", request_id);

      return json({ success: true });
    }

    // ASSIGN role
    if (req.method === "POST" && action === "assign-role") {
      const { user_id, role } = await req.json();
      if (!user_id || !role) return json({ error: "user_id and role required" }, 400);
      if (!["admin", "developer", "user"].includes(role)) return json({ error: "Invalid role" }, 400);
      const { error } = await adminClient.from("user_roles").insert({ user_id, role }).select();
      if (error?.code === "23505") return json({ error: "User already has this role" }, 409);
      if (error) throw error;
      return json({ success: true }, 201);
    }

    // REMOVE role
    if (req.method === "DELETE" && action === "remove-role") {
      const userId = url.searchParams.get("user_id");
      const role = url.searchParams.get("role");
      if (!userId || !role) return json({ error: "user_id and role required" }, 400);
      if (userId === user.id && role === "admin") return json({ error: "Cannot remove your own admin role" }, 400);
      await adminClient.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      return json({ success: true });
    }

    // CREATE key (admin direct)
    if (req.method === "POST" && action === "create") {
      const body = await req.json();
      const label = body.label || "Unnamed Key";
      const createdBy = body.created_by || user.id;
      const allowedServices = body.allowed_services || [];
      const keyValue = generateApiKey();
      const { data, error } = await adminClient.from("dex_api_keys")
        .insert(await buildApiKeyInsert(keyValue, { label, created_by: createdBy, allowed_services: allowedServices }))
        .select().single();
      if (error) throw error;
      return json({ key: { ...maskApiKey(data), key_value: keyValue } }, 201);
    }

    // REVOKE key
    if (req.method === "PUT" && action === "revoke") {
      const { id } = await req.json();
      await adminClient.from("dex_api_keys").update({ is_active: false, revoked_at: new Date().toISOString() }).eq("id", id);
      return json({ success: true });
    }

    // REACTIVATE key
    if (req.method === "PUT" && action === "reactivate") {
      const { id } = await req.json();
      await adminClient.from("dex_api_keys").update({ is_active: true, revoked_at: null }).eq("id", id);
      return json({ success: true });
    }

    // DELETE key
    if (req.method === "DELETE" && action === "delete-key") {
      const id = url.searchParams.get("id");
      await adminClient.from("dex_api_keys").delete().eq("id", id);
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function buildUsageStats(data: any[] | null) {
  const total = data?.length || 0;
  const rateLimited = data?.filter((r: any) => r.rate_limited).length || 0;
  const byEndpoint: Record<string, number> = {};
  const byStatus: Record<number, number> = {};
  for (const row of data || []) {
    byEndpoint[row.endpoint] = (byEndpoint[row.endpoint] || 0) + 1;
    byStatus[row.status_code] = (byStatus[row.status_code] || 0) + 1;
  }
  return { total_requests: total, rate_limited: rateLimited, by_endpoint: byEndpoint, by_status: byStatus, recent: (data || []).slice(0, 50) };
}

async function fetchOnchainWalletActivity() {
  const responses = await Promise.all(
    LUNEX_CONTRACTS.map(async (address) => {
      try {
        const url = `https://testnet.arcscan.app/api?module=account&action=txlist&address=${address}&sort=desc`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const rows = Array.isArray(data?.result) ? data.result : [];
        return rows.map((row: any) => ({
          address: String(row.from || "").toLowerCase(),
          timestamp: Number(row.timeStamp || 0) * 1000,
          source: "onchain" as const,
        })).filter((row: any) => row.address);
      } catch {
        return [];
      }
    })
  );

  return responses.flat();
}
