// Vercel Serverless Function - runs on Node.js, never exposes the API key to the browser.
// Set OPENROUTER_API_KEY in Vercel dashboard → Project Settings → Environment Variables.

const SYSTEM_PROMPT = `You are Lunex AI, a fully autonomous DeFi agent for the Lunex Finance protocol on Arc Network (Circle's EVM L1, testnet). You execute any protocol action on behalf of the user.

## Protocol
- StableSwap Pool: USDC/EURC AMM, earns swap fee APR
- luneUSDC Vault: ERC-4626 auto-compounding USDC vault
- luneEURC Vault: ERC-4626 auto-compounding EURC vault
- CCTP Bridge: Circle cross-chain transfer - Ethereum, Base, Avalanche, Arbitrum, Polygon ↔ Arc
- Send: ERC-20 transfers to any address

## Actions (call execute_action tool to perform any of these)
- swap: { fromToken, toToken, amount }
- add_liquidity: { usdcAmount, eurcAmount }  - set to "0" if not depositing that side
- remove_liquidity: { mode: "both"|"usdc"|"eurc", percent: 1-100 }
- vault_deposit: { token: "USDC"|"EURC", amount }
- vault_withdraw: { token: "USDC"|"EURC" }
- send: { token: "USDC"|"EURC", to: "0x...", amount }
- bridge: { token, fromChain, toChain, amount }
- evaluate: {}
- start_agent: {}
- stop_agent: {}

## Amount conventions
"all" / "everything" / "max" → pass "all"
"half" → pass "half"
"50%" → pass "50%"
plain number → pass as string: "100"

## Rules
- Call execute_action for anything the user wants to DO. For questions/info, just respond with text.
- response_text: 1-3 concise sentences. Use **bold** for token names and amounts.
- Never invent portfolio numbers - use only the context provided.
- Ask for clarification (no tool call) when amount or recipient is missing.
- Mention the 2-5 min attestation wait for bridge ops.`;

const EXECUTE_TOOL_PARAMS = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["swap","add_liquidity","remove_liquidity","vault_deposit","vault_withdraw","send","bridge","evaluate","start_agent","stop_agent"],
    },
    params: { type: "object" },
    response_text: {
      type: "string",
      description: "What to tell the user (shown while the tx executes)",
    },
  },
  required: ["action", "response_text"],
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
