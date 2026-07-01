import { parseUnits } from "viem";
import type { BridgeChainKey } from "@/features/bridge/config/bridgeConfig";

export type ActionKind =
  | "swap"
  | "add_liquidity"
  | "remove_liquidity"
  | "vault_deposit"
  | "vault_withdraw"
  | "send"
  | "bridge"
  | "evaluate"
  | "start_agent"
  | "stop_agent"
  | "query_portfolio"
  | "query_yields"
  | "query_help"
  | "unknown";

export interface ParsedIntent {
  action: ActionKind;
  amount?: string;       // primary amount string ("100", "all", "half", "50%")
  amount2?: string;      // secondary (e.g. EURC side when adding both)
  fromToken?: "USDC" | "EURC" | "USDT";
  toToken?: "USDC" | "EURC" | "USDT";
  vaultToken?: "USDC" | "EURC" | "USDT";
  fromChain?: BridgeChainKey;
  toChain?: BridgeChainKey;
  recipient?: string;
  removeMode?: "both" | "usdc" | "eurc";
  removePercent?: number;  // 1-100
  raw: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractAmount(s: string): string | undefined {
  // "all", "everything", "max", "full"
  if (/\b(all|everything|max|full|entire)\b/.test(s)) return "all";
  if (/\bhalf\b/.test(s)) return "half";
  // "50%" or "50 %"
  const pctMatch = s.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) return pctMatch[0]; // e.g. "50%"
  // plain number, possibly with commas
  const numMatch = s.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/);
  return numMatch ? numMatch[1].replace(/,/g, "") : undefined;
}

function extractAllAmounts(s: string): string[] {
  const matches = [...s.matchAll(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/g)];
  return matches.map((m) => m[1].replace(/,/g, ""));
}

function extractToken(s: string): "USDC" | "EURC" | "USDT" | undefined {
  if (/\beurc\b|\beuro\b|\beur\b/.test(s)) return "EURC";
  if (/\busdt\b|\btether\b/.test(s)) return "USDT";
  if (/\busdc\b|\bdollar\b/.test(s)) return "USDC";
  return undefined;
}

function extractTokenPair(s: string): ["USDC" | "EURC" | "USDT" | undefined, "USDC" | "EURC" | "USDT" | undefined] {
  const forMatch = s.match(/\b(usdc|eurc|usdt)\b.*?\b(?:to|for|→|->|into)\b.*?\b(usdc|eurc|usdt)\b/i);
  if (forMatch) {
    const a = forMatch[1].toUpperCase() as "USDC" | "EURC" | "USDT";
    const b = forMatch[2].toUpperCase() as "USDC" | "EURC" | "USDT";
    return [a, b];
  }
  return [extractToken(s), undefined];
}

function extractChain(s: string): BridgeChainKey | undefined {
  if (/\b(eth(?:ereum)?|sepolia)\b/.test(s)) return "ethereum";
  if (/\b(base)\b/.test(s)) return "base";
  if (/\b(arb(?:itrum)?)\b/.test(s)) return "arbitrum";
  if (/\b(avax|avalanche|fuji)\b/.test(s)) return "avalanche";
  if (/\b(polygon|matic|amoy)\b/.test(s)) return "polygon";
  if (/\b(arc)\b/.test(s)) return "arc";
  return undefined;
}

function extractBridgeChains(s: string): { from?: BridgeChainKey; to?: BridgeChainKey } {
  // "from X to Y" pattern
  const fromTo = s.match(/from\s+(\w+).*?to\s+(\w+)/i);
  if (fromTo) {
    return { from: extractChain(fromTo[1]), to: extractChain(fromTo[2]) };
  }
  // "to Y" - assume from = arc
  const toOnly = s.match(/\bto\s+(\w+)/i);
  if (toOnly) {
    const dest = extractChain(toOnly[1]);
    if (dest && dest !== "arc") return { from: "arc", to: dest };
  }
  return {};
}

function extractAddress(s: string): string | undefined {
  const m = s.match(/\b(0x[a-fA-F0-9]{40})\b/);
  return m?.[1];
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseIntent(input: string): ParsedIntent {
  const raw = input;
  const s = input.toLowerCase().trim();

  // ── Send ──
  if (/\b(send|transfer)\b/.test(s)) {
    const addr = extractAddress(s);
    const [from] = extractTokenPair(s);
    const token = from ?? extractToken(s) ?? "USDC";
    return { action: "send", amount: extractAmount(s), fromToken: token, recipient: addr, raw };
  }

  // ── Bridge ──
  if (/\bbridge\b/.test(s)) {
    const chains = extractBridgeChains(s);
    const [from] = extractTokenPair(s);
    const token = from ?? extractToken(s) ?? "USDC";
    return {
      action: "bridge",
      amount: extractAmount(s),
      fromToken: token,
      fromChain: chains.from ?? "arc",
      toChain: chains.to,
      raw,
    };
  }

  // ── Swap ──
  if (/\b(swap|exchange|convert|sell|trade)\b/.test(s)) {
    const [from, to] = extractTokenPair(s);
    return { action: "swap", amount: extractAmount(s), fromToken: from, toToken: to, raw };
  }

  // ── Remove Liquidity ──
  if (/\b(remove|withdraw|exit|pull)\b.*?\b(lp|liquidity|pool|position)\b/.test(s) ||
      /\b(exit pool|leave pool|remove lp|remove liquidity)\b/.test(s)) {
    const pctMatch = s.match(/(\d+(?:\.\d+)?)\s*%/);
    const pct = pctMatch ? parseFloat(pctMatch[1]) : 100;
    let mode: "both" | "usdc" | "eurc" = "both";
    if (/\busdc\b/.test(s)) mode = "usdc";
    else if (/\beurc\b/.test(s)) mode = "eurc";
    return { action: "remove_liquidity", removeMode: mode, removePercent: pct, raw };
  }

  // ── Add Liquidity ──
  if (/\b(add|provide|deposit|put)\b.*?\b(liquidity|pool|lp)\b/.test(s) ||
      /\b(add to pool|add liquidity)\b/.test(s)) {
    const nums = extractAllAmounts(s);
    const hasUsdc = /\busdc\b/.test(s);
    const hasEurc = /\beurc\b/.test(s);
    if (hasUsdc && hasEurc && nums.length >= 2) {
      // "add 100 USDC and 50 EURC"
      const usdcIdx = s.indexOf("usdc");
      const eurcIdx = s.indexOf("eurc");
      const usdcFirst = usdcIdx < eurcIdx;
      return {
        action: "add_liquidity",
        amount: usdcFirst ? nums[0] : nums[1],
        amount2: usdcFirst ? nums[1] : nums[0],
        fromToken: "USDC",
        toToken: "EURC",
        raw,
      };
    }
    const token = extractToken(s) ?? "USDC";
    return {
      action: "add_liquidity",
      amount: extractAmount(s),
      fromToken: token === "USDC" ? "USDC" : undefined,
      toToken: token === "EURC" ? "EURC" : undefined,
      raw,
    };
  }

  // ── Vault Withdraw ──
  if (/\b(withdraw|redeem|unstake|exit)\b.*?\b(vault|lune|yield)\b/.test(s) ||
      /\b(vault)\b.*?\b(withdraw|redeem|exit)\b/.test(s) ||
      /\b(withdraw from vault|redeem shares|exit vault)\b/.test(s)) {
    const token = extractToken(s) ?? "USDC";
    return { action: "vault_withdraw", vaultToken: token, raw };
  }

  // ── Vault Deposit ──
  if (/\b(deposit|stake|put|add)\b.*?\b(vault|lune|yield)\b/.test(s) ||
      /\b(vault)\b.*?\b(deposit|stake)\b/.test(s) ||
      /\b(earn yield|earn interest)\b/.test(s)) {
    const token = extractToken(s) ?? "USDC";
    return { action: "vault_deposit", amount: extractAmount(s), vaultToken: token, raw };
  }

  // ── Control ──
  if (/\b(start|activate|enable|turn on)\b.*?\b(agent|autopilot|autonomous|bot)\b/.test(s) ||
      s === "start" || s === "go" || s === "activate") {
    return { action: "start_agent", raw };
  }
  if (/\b(stop|pause|disable|halt|turn off)\b.*?\b(agent|autopilot|autonomous|bot)\b/.test(s) ||
      s === "stop" || s === "pause") {
    return { action: "stop_agent", raw };
  }

  // ── Evaluate ──
  if (/\b(evaluat|check|analy|assess|rebalance|optimize|run|execute)\b/.test(s)) {
    return { action: "evaluate", raw };
  }

  // ── Queries ──
  if (/\b(portfolio|position|balance|holding|status|overview|summary)\b/.test(s)) {
    return { action: "query_portfolio", raw };
  }
  if (/\b(yield|apy|apr|rate|earn|return|interest|best|compare|spread)\b/.test(s)) {
    return { action: "query_yields", raw };
  }
  if (/\b(help|what can|how|explain|tell me|what is|tutorial|guide)\b/.test(s)) {
    return { action: "query_help", raw };
  }

  return { action: "unknown", raw };
}

// ── Amount resolver ───────────────────────────────────────────────────────────
// Converts parsed amount strings to actual USDC/EURC raw bigints

export function resolveAmount(
  parsed: string | undefined,
  walletRaw: bigint,
  fallback?: bigint,
): bigint {
  if (!parsed) return fallback ?? 0n;
  if (parsed === "all") return walletRaw;
  if (parsed === "half") return walletRaw / 2n;
  const pctMatch = parsed.match(/^(\d+(?:\.\d+)?)%$/);
  if (pctMatch) {
    const pct = Math.min(100, Math.max(0, parseFloat(pctMatch[1])));
    return (walletRaw * BigInt(Math.floor(pct * 100))) / 10000n;
  }
  // numeric string → parse as 6-decimal USDC/EURC
  try {
    return parseUnits(parsed, 6);
  } catch {
    return fallback ?? 0n;
  }
}
