// Vercel Serverless Function - runs on Node.js, never exposes the API key to the browser.
// Set OPENROUTER_API_KEY in Vercel dashboard → Project Settings → Environment Variables.

const SYSTEM_PROMPT = `You are Lunex AI, a fully autonomous DeFi agent for the Lunex Finance protocol on Arc Network (Circle's EVM L1, testnet). You ALWAYS call the execute_action tool — for every single response, no exceptions.

## Protocol
- StableSwap Pool: USDC/EURC/USDT AMM, earns swap fee APR
- luneUSDC Vault: ERC-4626 auto-compounding USDC vault
- luneEURC Vault: ERC-4626 auto-compounding EURC vault
- CCTP Bridge: Circle cross-chain transfer - Ethereum, Base, Avalanche, Arbitrum, Polygon ↔ Arc
- Send: ERC-20 transfers to any address

## CRITICAL: You MUST call execute_action on EVERY response
The tool_choice is set to "required" — you cannot skip calling execute_action.
- When the user wants to DO something on-chain → call execute_action with the appropriate action
- When answering a question or providing info → call execute_action with action="respond"
- Never return plain text without calling the tool

### Tool call structure:
{
  "action": "<action_name>",
  "params": { <action-specific keys> },
  "response_text": "<1-3 sentence confirmation for the user>"
}

### Action schemas (all go inside "params"):
- swap:            { "fromToken": "USDC"|"EURC"|"USDT", "toToken": "USDC"|"EURC"|"USDT", "amount": "10" }
- add_liquidity:   { "usdcAmount": "50", "eurcAmount": "50" }  (use "0" if not depositing that side)
- remove_liquidity:{ "mode": "both"|"usdc"|"eurc", "percent": 100 }
- vault_deposit:   { "token": "USDC"|"EURC", "amount": "100" }
- vault_withdraw:  { "token": "USDC"|"EURC" }
- send:            { "token": "USDC"|"EURC", "to": "0x...", "amount": "10" }
- bridge:          { "token": "USDC"|"EURC", "fromChain": "arc", "toChain": "base", "amount": "50" }
- evaluate:        {}
- start_agent:     {}
- stop_agent:      {}
- respond:         {} ← use this for questions, info, clarification, or final summaries

### Amount conventions (values for "amount"):
- "all" / "everything" / "max" → "all"
- "half" → "half"
- "50%" → "50%"
- plain number → string e.g. "100"

### Example: "swap 10 USDC to EURC"
{ "action": "swap", "params": { "fromToken": "USDC", "toToken": "EURC", "amount": "10" }, "response_text": "Swapping **10 USDC** → **EURC** now." }

### Example: "what's my balance?"
{ "action": "respond", "params": {}, "response_text": "You have **X USDC** and **Y EURC** in your wallet." }

### Example: multi-step - after completing step 1 and being asked to continue
{ "action": "add_liquidity", "params": { "usdcAmount": "10", "eurcAmount": "0" }, "response_text": "Adding **10 USDC** to the pool." }

## Autonomy rules
- Execute ALL steps of a multi-step request. If user says "swap X USDC then deposit to vault", execute the swap first; the system will call you again to do the deposit.
- When continuing a multi-step task (system message says "Completed: ..."), execute the NEXT step immediately. Use respond only when ALL steps are done.
- response_text: 1-3 concise sentences. Use **bold** for token names and amounts.
- Never invent portfolio numbers — use only the Portfolio context provided.
- Mention the 2-5 min attestation wait for bridge operations.`;

const EXECUTE_TOOL_PARAMS = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["swap","add_liquidity","remove_liquidity","vault_deposit","vault_withdraw","send","bridge","evaluate","start_agent","stop_agent","respond"],
      description: "The protocol action to execute, or 'respond' to reply without any on-chain action.",
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
      model: "openai/gpt-4o",
      max_tokens: 1024,
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}\n\n${buildContextBlock(context)}` },
        ...messages,
      ],
      tools: [{
        type: "function",
        function: {
          name: "execute_action",
          description: "Execute a DeFi action on the Lunex protocol, or respond with text (action='respond').",
          parameters: EXECUTE_TOOL_PARAMS,
        },
      }],
      tool_choice: "required",
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
