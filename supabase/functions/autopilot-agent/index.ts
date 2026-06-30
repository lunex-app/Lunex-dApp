import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, apikey, x-client-info",
  "Content-Type": "application/json",
};

const SYSTEM_PROMPT = `You are Lunex Autopilot, a fully autonomous DeFi agent for the Lunex Finance protocol on Arc Network (Circle's EVM L1, testnet). You can execute any protocol action on behalf of the user.

## Protocol Overview
- **StableSwap Pool**: USDC/EURC AMM. Users can add/remove liquidity to earn swap fee APR.
- **luneUSDC Vault**: ERC-4626 auto-compounding vault. Deposit USDC to earn APY.
- **luneEURC Vault**: ERC-4626 auto-compounding vault. Deposit EURC to earn APY.
- **CCTP Bridge**: Circle's cross-chain transfer protocol. Supports Ethereum, Base, Avalanche, Arbitrum, Polygon ↔ Arc.
- **Send**: Direct ERC-20 transfers to any address.

## Available Actions
When the user wants to DO something, call the \`execute_action\` tool. Do NOT call it for informational queries.

Action schemas:
- **swap**: { fromToken: "USDC"|"EURC", toToken: "USDC"|"EURC", amount: string }
- **add_liquidity**: { usdcAmount: string, eurcAmount: string }  (set to "0" if not adding that token)
- **remove_liquidity**: { mode: "both"|"usdc"|"eurc", percent: number }  (percent 1-100)
- **vault_deposit**: { token: "USDC"|"EURC", amount: string }
- **vault_withdraw**: { token: "USDC"|"EURC" }
- **send**: { token: "USDC"|"EURC", to: string, amount: string }
- **bridge**: { token: "USDC"|"EURC", fromChain: string, toChain: string, amount: string }
- **evaluate**: {}  (run yield analysis, log decision)
- **start_agent**: {}  (activate the 30s autonomous evaluation loop)
- **stop_agent**: {}  (pause the autonomous loop)

## Amount Format Rules
- Specific number → pass as string: "100", "50.5"
- "all" / "everything" / "max" → pass "all"
- "half" → pass "half"
- Percentage like "50%" → pass "50%"

## Response Rules
- Always set response_text to a short, clear description of what you're doing or answering.
- Use **bold** for important numbers and token names.
- Be concise. 2-4 sentences max for actions, slightly more for informational answers.
- Never invent numbers — only use values from the portfolio context.
- For bridge operations, mention the 2-5 min attestation wait.
- If the user asks about rates/yields/balances, just respond with text (no tool call).
- If intent is ambiguous (missing amount or address), ask for clarification — no tool call.`;

const EXECUTE_TOOL = {
  name: "execute_action",
  description: "Execute a DeFi action on the Lunex protocol on behalf of the user.",
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["swap","add_liquidity","remove_liquidity","vault_deposit","vault_withdraw","send","bridge","evaluate","start_agent","stop_agent"],
        description: "The action to perform",
      },
      params: {
        type: "object",
        description: "Action-specific parameters as described in the system prompt",
      },
      response_text: {
        type: "string",
        description: "What to tell the user before/during executing this action (1-3 sentences, use **bold** for key values)",
      },
    },
    required: ["action", "response_text"],
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500, headers: CORS });
  }

  let body: { message: string; context: Record<string, unknown>; history: Array<{ role: string; content: string }> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: CORS });
  }

  const { message, context = {}, history = [] } = body;
  if (!message) return new Response(JSON.stringify({ error: "message is required" }), { status: 400, headers: CORS });

  // Build the per-request portfolio context block
  const ctx = context as Record<string, number | boolean | string>;
  const spread = ((ctx.vaultUsdcApy as number) ?? 0) - ((ctx.poolApr as number) ?? 0);
  const contextBlock = [
    `## Current Portfolio (live on-chain data)`,
    `Wallet: ${(ctx.usdcBalance as number)?.toFixed(4) ?? "0"} USDC · ${(ctx.eurcBalance as number)?.toFixed(4) ?? "0"} EURC`,
    `Pool LP position: ${(ctx.lpBalance as number)?.toFixed(4) ?? "0"} LP tokens — earning ~${(ctx.poolApr as number)?.toFixed(2) ?? "0"}% APR`,
    `luneUSDC vault: ${(ctx.vaultUsdcDeposited as number)?.toFixed(4) ?? "0"} USDC — earning ~${(ctx.vaultUsdcApy as number)?.toFixed(2) ?? "0"}% APY`,
    `luneEURC vault: ${(ctx.vaultEurcDeposited as number)?.toFixed(4) ?? "0"} EURC — earning ~${(ctx.vaultEurcApy as number)?.toFixed(2) ?? "0"}% APY`,
    `Yield spread (vault vs pool): ${spread >= 0 ? "+" : ""}${spread.toFixed(2)}%`,
    `Autonomous mode: ${ctx.agentActive ? "ON" : "OFF"}`,
  ].join("\n");

  // Convert chat history (last 10 turns) to Anthropic message format
  const priorMessages = history
    .slice(-10)
    .filter((m) => m.content?.trim())
    .map((m) => ({ role: m.role === "agent" ? "assistant" : "user", content: m.content }));

  const anthropicMessages = [
    ...priorMessages,
    { role: "user", content: message },
  ];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: `${SYSTEM_PROMPT}\n\n${contextBlock}`,
        tools: [EXECUTE_TOOL],
        tool_choice: { type: "auto" },
        messages: anthropicMessages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: `Anthropic API error: ${err}` }), { status: 502, headers: CORS });
    }

    const data = await res.json();
    let text = "";
    let action: string | null = null;
    let params: Record<string, unknown> = {};

    for (const block of data.content ?? []) {
      if (block.type === "text") text = block.text;
      if (block.type === "tool_use" && block.name === "execute_action") {
        action = block.input.action ?? null;
        params = block.input.params ?? {};
        text = block.input.response_text ?? "";
      }
    }

    return new Response(JSON.stringify({ text, action, params }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
