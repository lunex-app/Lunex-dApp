// Vercel Serverless Function - runs on Node.js, never exposes the API key to the browser.
// Set OPENROUTER_API_KEY in Vercel dashboard → Project Settings → Environment Variables.

const SYSTEM_PROMPT = `You are Lunex AI, a fully autonomous DeFi agent for the Lunex Finance protocol on Arc Network (Circle's EVM L1, testnet). You execute protocol actions on behalf of the user by calling the execute_action tool.

## Protocol
- StableSwap Pool: USDC/EURC AMM, earns swap fee APR
- luneUSDC Vault: ERC-4626 auto-compounding USDC vault
- luneEURC Vault: ERC-4626 auto-compounding EURC vault
- CCTP Bridge: Circle cross-chain transfer - Ethereum, Base, Avalanche, Arbitrum, Polygon ↔ Arc
- Send: ERC-20 transfers to any address

## CRITICAL: How to call execute_action
You MUST call the execute_action tool (do NOT just describe the action in text) when the user asks to DO something. Always include all three fields: action, params, response_text.

### Tool call structure:
{
  "action": "<action_name>",
  "params": { <action-specific keys> },
  "response_text": "<1-3 sentence confirmation for the user>"
}

### Action schemas (all go inside "params"):
- swap:            { "fromToken": "USDC"|"EURC", "toToken": "USDC"|"EURC", "amount": "10" }
- add_liquidity:   { "usdcAmount": "50", "eurcAmount": "50" }  (use "0" if not depositing that side)
- remove_liquidity:{ "mode": "both"|"usdc"|"eurc", "percent": 100 }
- vault_deposit:   { "token": "USDC"|"EURC", "amount": "100" }
- vault_withdraw:  { "token": "USDC"|"EURC" }
- send:            { "token": "USDC"|"EURC", "to": "0x...", "amount": "10" }
- bridge:          { "token": "USDC"|"EURC", "fromChain": "arc", "toChain": "base", "amount": "50" }
- evaluate:        {}
- start_agent:     {}
- stop_agent:      {}

### Amount conventions (values for "amount"):
- "all" / "everything" / "max" → "all"
- "half" → "half"
- "50%" → "50%"
- plain number → string e.g. "100"

### Example tool call for "swap 10 USDC to EURC":
{
  "action": "swap",
  "params": { "fromToken": "USDC", "toToken": "EURC", "amount": "10" },
  "response_text": "Swapping **10 USDC** → **EURC** now."
}

## Rules
- ALWAYS call execute_action when user wants to DO something on-chain. Never just describe it in text.
- For questions or portfolio info: respond with text only (no tool call).
- response_text: 1-3 concise sentences. Use **bold** for token names and amounts.
- Never invent portfolio numbers - use only the Portfolio context provided.
- Ask for clarification (no tool call) only when amount or recipient is genuinely missing.
- Mention the 2-5 min attestation wait for bridge operations.`;

const EXECUTE_TOOL_PARAMS = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["swap","add_liquidity","remove_liquidity","vault_deposit","vault_withdraw","send","bridge","evaluate","start_agent","stop_agent"],
      description: "The protocol action to execute.",
    },
    params: {
      type: "object",
      description: "Action-specific parameters. For swap: {fromToken, toToken, amount}. For add_liquidity: {usdcAmount, eurcAmount}. For remove_liquidity: {mode, percent}. For vault_deposit: {token, amount}. For vault_withdraw: {token}. For send: {token, to, amount}. For bridge: {token, fromChain, toChain, amount}. Empty object {} for evaluate/start_agent/stop_agent.",
      properties: {
        fromToken: { type: "string" },
        toToken: { type: "string" },
        token: { type: "string" },
        amount: { type: "string" },
        usdcAmount: { type: "string" },
        eurcAmount: { type: "string" },
        mode: { type: "string" },
        percent: { type: "number" },
        to: { type: "string" },
        fromChain: { type: "string" },
        toChain: { type: "string" },
      },
    },
    response_text: {
      type: "string",
      description: "1-3 sentence confirmation for the user, shown while the transaction executes. Use **bold** for token names and amounts.",
    },
  },
  required: ["action", "params", "response_text"],
};

function buildContextBlock(ctx: Record<string, number | boolean>) {
  const spread = (ctx.vaultUsdcApy ?? 0) - (ctx.poolApr ?? 0);
  return [
    "## Portfolio (live)",
    `Wallet: ${Number(ctx.usdcBalance ?? 0).toFixed(4)} USDC · ${Number(ctx.eurcBalance ?? 0).toFixed(4)} EURC`,
    `Pool LP: ${Number(ctx.lpBalance ?? 0).toFixed(4)} LP tokens - ~${Number(ctx.poolApr ?? 0).toFixed(2)}% APR`,
    `luneUSDC vault: ${Number(ctx.vaultUsdcDeposited ?? 0).toFixed(4)} USDC - ~${Number(ctx.vaultUsdcApy ?? 0).toFixed(2)}% APY`,
    `luneEURC vault: ${Number(ctx.vaultEurcDeposited ?? 0).toFixed(4)} EURC - ~${Number(ctx.vaultEurcApy ?? 0).toFixed(2)}% APY`,
    `Yield spread: ${spread >= 0 ? "+" : ""}${spread.toFixed(2)}%`,
    `Autonomous mode: ${ctx.agentActive ? "ON" : "OFF"}`,
  ].join("\n");
}

async function callOpenRouter(message: string, context: Record<string, number | boolean>, history: { role: string; content: string }[], apiKey: string) {
  const messages = [
    ...history
      .slice(-10)
      .filter((m) => m.content?.trim())
      .map((m) => ({ role: m.role === "agent" ? "assistant" : "user", content: m.content })),
    { role: "user", content: message },
  ];

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      max_tokens: 1024,
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n${buildContextBlock(context)}` },
        ...messages,
      ],
      tools: [{
        type: "function",
        function: {
          name: "execute_action",
          description: "Execute a DeFi action on the Lunex protocol.",
          parameters: EXECUTE_TOOL_PARAMS,
        },
      }],
      tool_choice: "auto",
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);

  const data = await res.json() as {
    choices: [{
      message: {
        content: string | null;
        tool_calls?: [{
          function: { name: string; arguments: string };
        }];
      };
    }];
  };

  const msg = data.choices[0]?.message;
  let text = msg?.content ?? "";
  let action: string | null = null;
  let params: Record<string, unknown> = {};

  if (msg?.tool_calls?.length) {
    const tc = msg.tool_calls[0];
    if (tc.function.name === "execute_action") {
      const input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      action = String(input.action ?? "");
      params = (input.params as Record<string, unknown>) ?? {};
      text = String(input.response_text ?? text ?? "");
    }
  }

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
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not set" }), { status: 500, headers: cors });

  try {
    const body = await req.json() as { message: string; context: Record<string, number | boolean>; history: { role: string; content: string }[] };
    const result = await callOpenRouter(body.message, body.context ?? {}, body.history ?? [], apiKey);
    return new Response(JSON.stringify(result), { headers: cors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: cors });
  }
}

export const config = { runtime: "edge" };
