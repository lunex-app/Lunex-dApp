import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, x-client-info, apikey",
  "Content-Type": "application/json",
};

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
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

const RPC_URL = "https://rpc.testnet.arc.network";
const POOL_ADDRESS = "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8";
const CHAIN_ID = 5042002;

const SUPPORTED_TOKENS: Record<string, { symbol: string; decimals: number; index: bigint }> = {
  "0x3600000000000000000000000000000000000000": { symbol: "USDC", decimals: 6, index: 0n },
  "0x89b50855aa3be2f677cd6303cec089b5f319d72a": { symbol: "EURC", decimals: 6, index: 1n },
};

function encodeBigInt(val: bigint): string { return val.toString(16).padStart(64, "0"); }

function encodeFunctionCall(selector: string, params: bigint[]): string {
  let data = selector;
  for (const p of params) data += encodeBigInt(p);
  return data;
}

function decodeBigInt(hex: string): bigint {
  return BigInt("0x" + (hex.startsWith("0x") ? hex.slice(2) : hex));
}

function encodeAddress(addr: string): string {
  return addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

const GET_DY_SELECTOR = "0x556d6e9f";
const EXCHANGE_SELECTOR = "0x5b41b908";
const APPROVE_SELECTOR = "0x095ea7b3";

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

  const auth = await validateApiKey(req, "swap");
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: "Invalid or missing API key", hint: "Set x-api-key header" }), {
      status: 401, headers: CORS_HEADERS,
    });
  }
  if (auth.forbidden) {
    await logUsage(auth.keyId, "/dex-swap", req.method, 403, false);
    return new Response(JSON.stringify({ error: "API key not authorized for swap service" }), { status: 403, headers: CORS_HEADERS });
  }

  const rl = checkRateLimit(auth.key);
  const rlHeaders = {
    ...CORS_HEADERS,
    "X-RateLimit-Limit": String(RATE_LIMIT),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
  };
  if (!rl.allowed) {
    await logUsage(auth.keyId, "/dex-swap", "POST", 429, true);
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
      status: 429, headers: rlHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), { status: 405, headers: rlHeaders });
  }

  try {
    const body = await req.json();
    const { walletAddress, tokenIn, tokenOut, amountIn, slippage = 0.5 } = body;

    if (!walletAddress || !tokenIn || !tokenOut || !amountIn) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          required: ["walletAddress", "tokenIn", "tokenOut", "amountIn"],
          optional: ["slippage (default: 0.5)"],
        }),
        { status: 400, headers: rlHeaders }
      );
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return new Response(JSON.stringify({ error: "Invalid walletAddress format" }), { status: 400, headers: rlHeaders });
    }

    const inToken = SUPPORTED_TOKENS[tokenIn.toLowerCase()];
    const outToken = SUPPORTED_TOKENS[tokenOut.toLowerCase()];

    if (!inToken || !outToken) {
      return new Response(
        JSON.stringify({
          error: "Unsupported token",
          supportedTokens: Object.entries(SUPPORTED_TOKENS).map(([addr, t]) => ({ address: addr, symbol: t.symbol })),
        }),
        { status: 400, headers: rlHeaders }
      );
    }

    if (inToken.index === outToken.index) {
      return new Response(JSON.stringify({ error: "tokenIn and tokenOut must be different" }), { status: 400, headers: rlHeaders });
    }

    const amountInBigInt = BigInt(amountIn);
    if (amountInBigInt <= 0n) {
      return new Response(JSON.stringify({ error: "amountIn must be positive" }), { status: 400, headers: rlHeaders });
    }

    const dyData = encodeFunctionCall(GET_DY_SELECTOR, [inToken.index, outToken.index, amountInBigInt]);
    const dyResult = await ethCall(POOL_ADDRESS, dyData);
    const expectedOut = decodeBigInt(dyResult);

    if (expectedOut === 0n) {
      return new Response(JSON.stringify({ error: "Insufficient liquidity for this trade" }), { status: 422, headers: rlHeaders });
    }

    const slippageBps = BigInt(Math.floor((1 - slippage / 100) * 10000));
    const minDy = (expectedOut * slippageBps) / 10000n;

    const maxApproval = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    const approveData = APPROVE_SELECTOR + encodeAddress(POOL_ADDRESS) + encodeBigInt(maxApproval);

    const swapData = encodeFunctionCall(EXCHANGE_SELECTOR, [inToken.index, outToken.index, amountInBigInt, minDy]);

    await logUsage(auth.keyId, "/dex-swap", "POST", 200, false);
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          approveTransaction: { to: tokenIn, data: approveData, value: "0x0", chainId: CHAIN_ID, gasLimit: "60000" },
          swapTransaction: { to: POOL_ADDRESS, data: swapData, value: "0x0", chainId: CHAIN_ID, gasLimit: "250000" },
          expectedOutput: expectedOut.toString(),
          minimumOutput: minDy.toString(),
          slippagePercent: slippage,
          tokenIn: { address: tokenIn, symbol: inToken.symbol, decimals: inToken.decimals },
          tokenOut: { address: tokenOut, symbol: outToken.symbol, decimals: outToken.decimals },
        },
        meta: { protocol: "Lunex", chainId: CHAIN_ID, chainName: "Arc Testnet", pool: POOL_ADDRESS, timestamp: new Date().toISOString() },
      }),
      { status: 200, headers: rlHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    await logUsage(auth.keyId, "/dex-swap", "POST", 500, false);
    return new Response(JSON.stringify({ success: false, error: message }), { status: 500, headers: rlHeaders });
  }
});
