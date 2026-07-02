// Vercel Edge Function — keeps ANTHROPIC_API_KEY server-side, never reaches the browser.
// Set ANTHROPIC_API_KEY in Vercel → Project Settings → Environment Variables.

const SYSTEM_PROMPT = `You are Lunex AI, a fully autonomous DeFi agent for the Lunex Finance protocol on Arc Network (Circle's EVM L1, testnet). You ALWAYS call the execute_action tool — for every single response, no exceptions.

## Protocol
- StableSwap Pools (3 pairs, route automatically):
  • USDC/EURC pool · USDC/USDT pool · EURC/USDT pool
- Vaults (ERC-4626, auto-compounding):
  • luneUSDC vault — deposit/withdraw USDC
  • luneEURC vault — deposit/withdraw EURC
  • luneUSDT vault — deposit/withdraw USDT
- CCTP Bridge: burn-and-mint USDC/EURC cross-chain — Ethereum, Base, Avalanche, Arbitrum, Polygon ↔ Arc (~2-5 min attestation)
- Send: on-chain ERC-20 transfer to any 0x address

## CRITICAL: You MUST call execute_action on EVERY response
- When the user wants to DO something on-chain → call execute_action with the appropriate action
- When answering a question or providing info → call execute_action with action="respond"
- Never return plain text without calling the tool

### Action schemas (all go inside "params"):
- swap:            { "fromToken": "USDC"|"EURC"|"USDT", "toToken": "USDC"|"EURC"|"USDT", "amount": "10" }
- add_liquidity:   { "pool": "USDC/EURC"|"USDC/USDT"|"EURC/USDT", "usdcAmount": "50", "eurcAmount": "50", "usdtAmount": "0" } — omit or "0" for tokens not in the pool
- remove_liquidity:{ "pool": "USDC/EURC"|"USDC/USDT"|"EURC/USDT", "mode": "both"|"usdc"|"eurc"|"usdt", "percent": 100 }
- vault_deposit:   { "token": "USDC"|"EURC"|"USDT", "amount": "100" }
- vault_withdraw:  { "token": "USDC"|"EURC"|"USDT" }
- send:            { "token": "USDC"|"EURC"|"USDT", "to": "0x...", "amount": "10" }
- bridge:          { "token": "USDC"|"EURC", "fromChain": "arc", "toChain": "base", "amount": "50" }
- claim_faucet:    {} — claims 1,000 testnet USDT (24h cooldown; will error if still on cooldown)
- evaluate:        {}
- start_agent:     {}
- stop_agent:      {}
- respond:         {}

### Amount conventions: "all"/"everything"/"max" → "all" | "half" → "half" | plain number → e.g. "100"

## Rules
1. ALWAYS call execute_action. Use "respond" for info/questions.
2. response_text: 1-3 concise sentences. Use **bold** for token names and amounts.
3. Never invent portfolio numbers — use only the Portfolio context.
4. Pool routing is automatic — just specify fromToken and toToken.
5. Mention ~2-5 min wait for bridge operations.`;

const EXECUTE_TOOL = {
  name: "execute_action",
  description: "Execute a DeFi action on the Lunex protocol, or respond with text (action='respond').",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        enum: ["swap","add_liquidity","remove_liquidity","vault_deposit","vault_withdraw","send","bridge","claim_faucet","evaluate","start_agent","stop_agent","respond"],
      },
      params: {
        type: "object",
        properties: {
          fromToken:  { type: "string" },
          toToken:    { type: "string" },
          token:      { type: "string" },
          amount:     { type: "string" },
          pool:       { type: "string" },
          usdcAmount: { type: "string" },
          eurcAmount: { type: "string" },
          usdtAmount: { type: "string" },
          mode:       { type: "string" },
          percent:    { type: "number" },
          to:         { type: "string" },
          fromChain:  { type: "string" },
          toChain:    { type: "string" },
        },
      },
      response_text: {
        type: "string",
        description: "1-3 sentence confirmation shown to the user while the tx executes.",
      },
    },
    required: ["action", "params", "response_text"],
  },
};

function buildContextBlock(ctx: Record<string, number | boolean>) {
  const spread = (Number(ctx.vaultUsdcApy) || 0) - (Number(ctx.poolApr) || 0);
  return [
    "## Portfolio (live)",
    `Wallet: ${Number(ctx.usdcBalance || 0).toFixed(4)} USDC · ${Number(ctx.eurcBalance || 0).toFixed(4)} EURC · ${Number(ctx.usdtBalance || 0).toFixed(4)} USDT`,
    `Pool LP: ${Number(ctx.lpBalance || 0).toFixed(4)} LP — ~${Number(ctx.poolApr || 0).toFixed(2)}% APR`,
    `luneUSDC vault: ${Number(ctx.vaultUsdcDeposited || 0).toFixed(4)} USDC — ~${Number(ctx.vaultUsdcApy || 0).toFixed(2)}% APY`,
    `luneEURC vault: ${Number(ctx.vaultEurcDeposited || 0).toFixed(4)} EURC — ~${Number(ctx.vaultEurcApy || 0).toFixed(2)}% APY`,
    `luneUSDT vault: ${Number(ctx.vaultUsdtDeposited || 0).toFixed(4)} USDT`,
    `Yield spread: ${spread >= 0 ? "+" : ""}${spread.toFixed(2)}%`,
    `Autonomous mode: ${ctx.agentActive ? "ON" : "OFF"}`,
  ].join("\n");
}

async function callAnthropic(
  message: string,
  context: Record<string, number | boolean>,
  history: { role: string; content: string }[],
  apiKey: string,
) {
  const prior = history
    .slice(-10)
    .filter((m) => m.content?.trim())
    .map((m) => ({ role: m.role === "agent" ? "assistant" : ("user" as "user" | "assistant"), content: m.content }));

  const res = await fetch("https://router-api.0g.ai/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "glm-5.1",
      max_tokens: 512,
      system: `${SYSTEM_PROMPT}\n\n${buildContextBlock(context)}`,
      tools: [EXECUTE_TOOL],
      tool_choice: { type: "auto" },
      messages: [...prior, { role: "user", content: message }],
    }),
  });

  if (!res.ok) throw new Error(`0G AI ${res.status}: ${await res.text()}`);

  const data = await res.json() as {
    content: { type: string; text?: string; name?: string; input?: Record<string, unknown> }[];
  };

  let text = "", action: string | null = null, params: Record<string, unknown> = {};

  for (const block of data.content ?? []) {
    if (block.type === "text") text = block.text ?? "";
    if (block.type === "tool_use" && block.name === "execute_action") {
      action = String(block.input?.action ?? "");
      params = (block.input?.params as Record<string, unknown>) ?? {};
      text   = String(block.input?.response_text ?? text ?? "");
    }
  }

  // If model returned text only (no tool call), treat as a plain respond
  if (!action && text) action = "respond";

  return { text, action, params };
}

export default async function handler(req: Request): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST")   return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors });

  const apiKey = process.env.ZEROG_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "ZEROG_API_KEY not set in Vercel environment variables" }), { status: 500, headers: cors });

  try {
    const body = await req.json() as { message: string; context: Record<string, number | boolean>; history: { role: string; content: string }[] };
    const result = await callAnthropic(body.message, body.context ?? {}, body.history ?? [], apiKey);
    return new Response(JSON.stringify(result), { headers: cors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: cors });
  }
}

export const config = { runtime: "edge" };
