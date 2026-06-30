import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { VitePWA } from "vite-plugin-pwa";
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "http";

// ── Dev-only proxy for /api/autopilot-agent ───────────────────────────────────
// Keeps ANTHROPIC_API_KEY on the Node.js side - it never reaches the browser.
// Set it in .env.local (no VITE_ prefix needed; Vite loads it server-side only).
function autopilotDevPlugin(): Plugin {
  const SYSTEM_PROMPT = `You are Lunex Autopilot, a fully autonomous DeFi agent for the Lunex Finance protocol on Arc Network (Circle's EVM L1, testnet). You execute any protocol action on behalf of the user.

## Protocol
- StableSwap Pool: USDC/EURC AMM, earns swap fee APR
- luneUSDC Vault: ERC-4626 auto-compounding USDC vault
- luneEURC Vault: ERC-4626 auto-compounding EURC vault
- CCTP Bridge: Circle cross-chain transfer - Ethereum, Base, Avalanche, Arbitrum, Polygon ↔ Arc
- Send: ERC-20 transfers to any address

## Actions (call execute_action tool to perform any of these)
- swap: { fromToken, toToken, amount }
- add_liquidity: { usdcAmount, eurcAmount } - set "0" if not depositing that side
- remove_liquidity: { mode: "both"|"usdc"|"eurc", percent: 1-100 }
- vault_deposit: { token: "USDC"|"EURC", amount }
- vault_withdraw: { token: "USDC"|"EURC" }
- send: { token: "USDC"|"EURC", to: "0x...", amount }
- bridge: { token, fromChain, toChain, amount }
- evaluate: {}
- start_agent: {}
- stop_agent: {}

## Amount conventions
"all"/"everything"/"max" → "all" | "half" → "half" | "50%" → "50%" | number → "100"

## Rules
- Call execute_action for anything the user wants to DO. For questions, just respond with text.
- response_text: 1-3 concise sentences. Use **bold** for token names and key amounts.
- Never invent numbers - use only the portfolio context below.
- Ask for clarification (no tool call) when amount or recipient is missing.
- Mention 2-5 min attestation wait for bridge ops.`;

  const EXECUTE_TOOL = {
    name: "execute_action",
    description: "Execute a DeFi action on the Lunex protocol.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["swap","add_liquidity","remove_liquidity","vault_deposit","vault_withdraw","send","bridge","evaluate","start_agent","stop_agent"] },
        params: { type: "object" },
        response_text: { type: "string", description: "What to tell the user while the tx executes" },
      },
      required: ["action", "response_text"],
    },
  };

  return {
    name: "autopilot-agent-dev",
    configureServer(server) {
      server.middlewares.use("/api/autopilot-agent", async (req: IncomingMessage, res: ServerResponse) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Content-Type": "application/json",
        };
        Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

        if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
        if (req.method !== "POST") { res.statusCode = 405; res.end(JSON.stringify({ error: "POST only" })); return; }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Add ANTHROPIC_API_KEY=sk-ant-... to your .env.local file" }));
          return;
        }

        let raw = "";
        req.on("data", (c: Buffer) => { raw += c.toString(); });
        await new Promise<void>((r) => req.on("end", r));

        try {
          const { message, context = {}, history = [] } = JSON.parse(raw);
          const ctx = context as Record<string, number | boolean>;
          const spread = (Number(ctx.vaultUsdcApy) || 0) - (Number(ctx.poolApr) || 0);
          const contextBlock = [
            "## Portfolio (live)",
            `Wallet: ${Number(ctx.usdcBalance || 0).toFixed(4)} USDC · ${Number(ctx.eurcBalance || 0).toFixed(4)} EURC`,
            `Pool LP: ${Number(ctx.lpBalance || 0).toFixed(4)} LP - ~${Number(ctx.poolApr || 0).toFixed(2)}% APR`,
            `luneUSDC vault: ${Number(ctx.vaultUsdcDeposited || 0).toFixed(4)} USDC - ~${Number(ctx.vaultUsdcApy || 0).toFixed(2)}% APY`,
            `luneEURC vault: ${Number(ctx.vaultEurcDeposited || 0).toFixed(4)} EURC - ~${Number(ctx.vaultEurcApy || 0).toFixed(2)}% APY`,
            `Yield spread: ${spread >= 0 ? "+" : ""}${spread.toFixed(2)}%`,
            `Autonomous mode: ${ctx.agentActive ? "ON" : "OFF"}`,
          ].join("\n");

          const prior = (history as { role: string; content: string }[])
            .slice(-10).filter((m) => m.content?.trim())
            .map((m) => ({ role: m.role === "agent" ? "assistant" : "user", content: m.content }));

          const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 1024,
              system: `${SYSTEM_PROMPT}\n\n${contextBlock}`,
              tools: [EXECUTE_TOOL],
              tool_choice: { type: "auto" },
              messages: [...prior, { role: "user", content: message }],
            }),
          });

          if (!anthropicRes.ok) throw new Error(`Anthropic ${anthropicRes.status}: ${await anthropicRes.text()}`);

          const data = await anthropicRes.json() as { content: { type: string; text?: string; name?: string; input?: Record<string, unknown> }[] };
          let text = "", action: string | null = null, params: Record<string, unknown> = {};

          for (const block of data.content ?? []) {
            if (block.type === "text") text = block.text ?? "";
            if (block.type === "tool_use" && block.name === "execute_action") {
              action = String(block.input?.action ?? "");
              params = (block.input?.params as Record<string, unknown>) ?? {};
              text = String(block.input?.response_text ?? "");
            }
          }

          res.statusCode = 200;
          res.end(JSON.stringify({ text, action, params }));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
      });
    },
  };
}

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: [".trycloudflare.com", ".up.railway.app"],
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    autopilotDevPlugin(),
    react(),
    // Circle's w3s-pw-web-sdk (email/PIN) pulls Node deps (jsonwebtoken, util,
    // stream, Buffer). Polyfill them for the browser so the email flow doesn't
    // throw "Object prototype may only be an Object or null".
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "lunex-logo.png", "apple-touch-icon.png"],
      manifest: {
        name: "Lunex Finance",
        short_name: "Lunex",
        description: "Institutional DeFi on Arc Network — swap, earn, bridge.",
        theme_color: "#04070F",
        background_color: "#04070F",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
        // Cache all static assets
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Serve stale while revalidating for app shell
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/rpc\./i,
            handler: "NetworkOnly",
          },
        ],
        // Skip waiting so new SW activates immediately
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "wagmi"],
  },
}));
