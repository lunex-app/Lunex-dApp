import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ─── Lunex Finance DEX Adapter — Quote Endpoint ───
// GET /dex-quote?tokenIn=0x...&tokenOut=0x...&amountIn=1000000&slippage=0.5
// Requires header: x-api-key
// Rate limited: 60 requests/minute per API key

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, x-client-info, apikey",
  "Content-Type": "application/json",
};

// ─── Rate Limiting (in-memory, per-isolate) ───
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateLimitMap.set(key, entry);
  }
  entry.count++;
  return {
    allowed: entry.count <= RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - entry.count),
    resetAt: entry.resetAt,
  };
}

// ─── DB-backed API Key Auth ───
function getAdminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validateApiKey(req: Request, service: string): Promise<{ valid: boolean; key: string; keyId: string | null; forbidden?: boolean }> {
  const apiKey = req.headers.get("x-api-key") || "";
  if (!apiKey) return { valid: false, key: "", keyId: null };
  const db = getAdminClient();
  const keyHash = await sha256Hex(apiKey);
  let { data } = await db.from("dex_api_keys").select("id, allowed_services").eq("key_hash", keyHash).eq("is_active", true).maybeSingle();
  if (!data) {
    const legacy = await db.from("dex_api_keys").select("id, allowed_services").eq("key_value", apiKey).eq("is_active", true).maybeSingle();
    data = legacy.data;
  }
  if (!data) return { valid: false, key: apiKey, keyId: null };
  const services: string[] = data.allowed_services || [];
  if (services.length > 0 && !services.includes(service)) return { valid: true, key: apiKey, keyId: data.id, forbidden: true };
  return { valid: true, key: apiKey, keyId: data.id };
}

async function logUsage(keyId: string | null, endpoint: string, method: string, statusCode: number, rateLimited: boolean) {
  if (!keyId) return;
  try {
    const db = getAdminClient();
    await db.from("dex_api_usage").insert({ api_key_id: keyId, endpoint, method, status_code: statusCode, rate_limited: rateLimited });
  } catch { /* non-blocking */ }
}

// ─── Contract Config ───
const RPC_URL = "https://rpc.testnet.arc.network";
const POOL_ADDRESS = "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8";

const SUPPORTED_TOKENS: Record<string, { symbol: string; decimals: number; index: bigint }> = {
  "0x3600000000000000000000000000000000000000": { symbol: "USDC", decimals: 6, index: 0n },
  "0x89b50855aa3be2f677cd6303cec089b5f319d72a": { symbol: "EURC", decimals: 6, index: 1n },
};

function encodeFunctionCall(selector: string, params: bigint[]): string {
  let data = selector;
  for (const p of params) data += p.toString(16).padStart(64, "0");
  return data;
}

function decodeBigInt(hex: string): bigint {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return BigInt("0x" + clean);
}

const GET_DY_SELECTOR = "0x556d6e9f";
const FEE_SELECTOR = "0xddca3f43";

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

async function getQuote(tokenIn: string, tokenOut: string, amountIn: string, _slippage: number) {
  const inToken = SUPPORTED_TOKENS[tokenIn.toLowerCase()];
  const outToken = SUPPORTED_TOKENS[tokenOut.toLowerCase()];

  if (!inToken || !outToken) {
    throw new Error(`Unsupported token pair. Supported: ${Object.keys(SUPPORTED_TOKENS).join(", ")}`);
  }
  if (inToken.index === outToken.index) {
    throw new Error("tokenIn and tokenOut must be different");
  }

  const amountInBigInt = BigInt(amountIn);
  if (amountInBigInt <= 0n) {
    throw new Error("amountIn must be positive");
  }

  const dyData = encodeFunctionCall(GET_DY_SELECTOR, [inToken.index, outToken.index, amountInBigInt]);
  const dyResult = await ethCall(POOL_ADDRESS, dyData);
  const amountOut = decodeBigInt(dyResult);

  const oneUnit = BigInt(10 ** inToken.decimals);
  const spotData = encodeFunctionCall(GET_DY_SELECTOR, [inToken.index, outToken.index, oneUnit]);
  const spotResult = await ethCall(POOL_ADDRESS, spotData);
  const spotOut = decodeBigInt(spotResult);

  const feeResult = await ethCall(POOL_ADDRESS, FEE_SELECTOR);
  const feeRaw = decodeBigInt(feeResult);
  const feePercent = Number(feeRaw) / 1e8 * 100;

  const normalizedEffective = Number(amountOut) * (10 ** inToken.decimals) / (Number(amountInBigInt) * (10 ** outToken.decimals));
  const normalizedSpot = Number(spotOut) / (10 ** outToken.decimals);
  const priceImpact = normalizedSpot > 0 ? ((normalizedSpot - normalizedEffective) / normalizedSpot) * 100 : 0;

  return {
    amountOut: amountOut.toString(),
    priceImpact: Math.max(0, Math.round(priceImpact * 10000) / 10000),
    route: [{ protocol: "Lunex Finance", pool: POOL_ADDRESS, tokenIn, tokenOut }],
    estimatedGas: "150000",
    fees: { swapFeePercent: feePercent.toFixed(4), protocolFee: "0" },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // ─── Auth check ───
  const auth = await validateApiKey(req, "quote");
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: "Invalid or missing API key", hint: "Set x-api-key header" }), {
      status: 401, headers: CORS_HEADERS,
    });
  }
  if (auth.forbidden) {
    await logUsage(auth.keyId, "/dex-quote", req.method, 403, false);
    return new Response(JSON.stringify({ error: "API key not authorized for quote service" }), { status: 403, headers: CORS_HEADERS });
  }

  // ─── Rate limit check ───
  const rl = checkRateLimit(auth.key);
  const rlHeaders = {
    ...CORS_HEADERS,
    "X-RateLimit-Limit": String(RATE_LIMIT),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
  };
  if (!rl.allowed) {
    await logUsage(auth.keyId, "/dex-quote", "GET", 429, true);
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
      status: 429, headers: rlHeaders,
    });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: rlHeaders });
  }

  try {
    const url = new URL(req.url);
    const tokenIn = url.searchParams.get("tokenIn");
    const tokenOut = url.searchParams.get("tokenOut");
    const amountIn = url.searchParams.get("amountIn");
    const slippage = parseFloat(url.searchParams.get("slippage") || "0.5");

    if (!tokenIn || !tokenOut || !amountIn) {
      await logUsage(auth.keyId, "/dex-quote", "GET", 400, false);
      return new Response(
        JSON.stringify({
          error: "Missing required parameters",
          required: ["tokenIn", "tokenOut", "amountIn"],
          optional: ["slippage (default: 0.5)"],
          example: "/dex-quote?tokenIn=0x3600000000000000000000000000000000000000&tokenOut=0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a&amountIn=1000000",
        }),
        { status: 400, headers: rlHeaders }
      );
    }

    const quote = await getQuote(tokenIn, tokenOut, amountIn, slippage);
    await logUsage(auth.keyId, "/dex-quote", "GET", 200, false);

    return new Response(
      JSON.stringify({
        success: true,
        data: quote,
        meta: { protocol: "Lunex", chainId: 5042002, chainName: "Arc Testnet", timestamp: new Date().toISOString() },
      }),
      { status: 200, headers: rlHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("Unsupported") || message.includes("must be") ? 400 : 500;
    await logUsage(auth.keyId, "/dex-quote", "GET", status, false);
    return new Response(JSON.stringify({ success: false, error: message }), { status, headers: rlHeaders });
  }
});
