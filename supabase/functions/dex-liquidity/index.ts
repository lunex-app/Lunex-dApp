import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, x-client-info, apikey",
  "Content-Type": "application/json",
};

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(key: string) {
  const now = Date.now();
  let entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateLimitMap.set(key, entry);
  }
  entry.count++;
  return { allowed: entry.count <= RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - entry.count), resetAt: entry.resetAt };
}

function getAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function validateApiKey(req: Request, service: string): Promise<{ valid: boolean; key: string; keyId: string | null; forbidden?: boolean }> {
  const apiKey = req.headers.get("x-api-key") || "";
  if (!apiKey) return { valid: false, key: "", keyId: null };
  const db = getAdminClient();
  const { data } = await db.from("dex_api_keys").select("id, allowed_services").eq("key_value", apiKey).eq("is_active", true).maybeSingle();
  if (!data) return { valid: false, key: apiKey, keyId: null };
  const services: string[] = data.allowed_services || [];
  if (services.length > 0 && !services.includes(service)) return { valid: true, key: apiKey, keyId: data.id, forbidden: true };
  return { valid: true, key: apiKey, keyId: data.id };
}

async function logUsage(keyId: string | null, endpoint: string, method: string, statusCode: number, rateLimited: boolean) {
  if (!keyId) return;
  try { const db = getAdminClient(); await db.from("dex_api_usage").insert({ api_key_id: keyId, endpoint, method, status_code: statusCode, rate_limited: rateLimited }); } catch { /* */ }
}

// ─── Contract Config ───
const RPC_URL = "https://rpc.testnet.arc.network";
const POOL_ADDRESS = "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8";

const TOKENS = [
  { symbol: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6, index: 0n },
  { symbol: "EURC", address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", decimals: 6, index: 1n },
];

// Function selectors
const BALANCES_SELECTOR = "0x4903b0d1"; // balances(uint256)
const FEE_SELECTOR = "0xddca3f43"; // fee()
const LP_TOKEN_SELECTOR = "0x5fcbd285"; // lpToken()
const TOTAL_SUPPLY_SELECTOR = "0x18160ddd"; // totalSupply()

function encodeBigInt(val: bigint): string { return val.toString(16).padStart(64, "0"); }

function decodeBigInt(hex: string): bigint {
  return BigInt("0x" + (hex.startsWith("0x") ? hex.slice(2) : hex));
}

function decodeAddress(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return "0x" + clean.slice(24);
}

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "RPC error");
  return json.result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const auth = await validateApiKey(req, "liquidity");
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: "Invalid or missing API key" }), { status: 401, headers: CORS_HEADERS });
  }
  if (auth.forbidden) {
    await logUsage(auth.keyId, "/dex-liquidity", req.method, 403, false);
    return new Response(JSON.stringify({ error: "API key not authorized for liquidity service" }), { status: 403, headers: CORS_HEADERS });
  }
  const rl = checkRateLimit(auth.key);
  const rlHeaders = {
    ...CORS_HEADERS,
    "X-RateLimit-Limit": String(RATE_LIMIT),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
  };
  if (!rl.allowed) {
    await logUsage(auth.keyId, "/dex-liquidity", "GET", 429, true);
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: rlHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: rlHeaders });
  }

  try {
    // Fetch reserves for each token
    const reserves = await Promise.all(
      TOKENS.map(async (token) => {
        const data = "0x4903b0d1" + encodeBigInt(token.index);
        const result = await ethCall(POOL_ADDRESS, data);
        const raw = decodeBigInt(result);
        return {
          symbol: token.symbol,
          address: token.address,
          decimals: token.decimals,
          reserveRaw: raw.toString(),
          reserveFormatted: (Number(raw) / (10 ** token.decimals)).toFixed(token.decimals),
        };
      })
    );

    // Fetch fee
    const feeResult = await ethCall(POOL_ADDRESS, FEE_SELECTOR);
    const feeRaw = decodeBigInt(feeResult);
    const feePercent = Number(feeRaw) / 1e8 * 100;

    // Fetch LP token address
    let lpTokenAddress = "";
    try {
      const lpResult = await ethCall(POOL_ADDRESS, LP_TOKEN_SELECTOR);
      lpTokenAddress = decodeAddress(lpResult);
    } catch { /* LP token call may not exist */ }

    // Fetch LP total supply
    let lpTotalSupply = "0";
    let lpTotalSupplyFormatted = "0";
    if (lpTokenAddress) {
      try {
        const supplyResult = await ethCall(lpTokenAddress, TOTAL_SUPPLY_SELECTOR);
        const supplyRaw = decodeBigInt(supplyResult);
        lpTotalSupply = supplyRaw.toString();
        lpTotalSupplyFormatted = (Number(supplyRaw) / 1e18).toFixed(6);
      } catch { /* ignore */ }
    }

    // Calculate TVL (sum of reserves in USD — both are stablecoins pegged ~$1)
    const tvl = reserves.reduce((sum, r) => sum + Number(r.reserveRaw) / (10 ** r.decimals), 0);

    await logUsage(auth.keyId, "/dex-liquidity", "GET", 200, false);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          pool: {
            address: POOL_ADDRESS,
            type: "StableSwap (Curve-style)",
            fee: { raw: feeRaw.toString(), percent: feePercent.toFixed(4) },
          },
          reserves,
          tvl: { usd: tvl.toFixed(2), formatted: `$${tvl.toLocaleString("en-US", { minimumFractionDigits: 2 })}` },
          lpToken: {
            address: lpTokenAddress || "unknown",
            totalSupply: lpTotalSupply,
            totalSupplyFormatted: lpTotalSupplyFormatted,
          },
        },
        meta: {
          protocol: "Lunex",
          chainId: 5042002,
          chainName: "Arc Testnet",
          timestamp: new Date().toISOString(),
        },
      }),
      { status: 200, headers: rlHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    await logUsage(auth.keyId, "/dex-liquidity", "GET", 500, false);
    return new Response(JSON.stringify({ success: false, error: message }), { status: 500, headers: rlHeaders });
  }
});
