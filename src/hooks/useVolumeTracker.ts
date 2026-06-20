import { useCallback } from "react";
import { CONTRACTS } from "@/config/wagmi";
import { ARC_TOPICS, STABLE_DECIMALS, fetchAllLogs, logWord, type ExplorerLog } from "@/lib/arcLogs";

type EventType = "swap" | "add_liquidity" | "remove_liquidity" | "vault_deposit" | "vault_withdraw";

/**
 * Protocol volume is read LIVE ON-CHAIN (see `fetchTotalVolumeUsd` below) by
 * scanning Lunex contract event logs through Arc's indexed explorer API — no
 * Supabase, no off-chain database. `recordVolume` is therefore a no-op kept only
 * so the swap/liquidity/vault hooks can call it without change; the on-chain
 * events those transactions emit are the single source of truth.
 */
export function useVolumeTracker() {
  const recordVolume = useCallback(
    async (_params: {
      txHash: string;
      eventType: EventType;
      amountUsd: number;
      contract: string;
      blockNumber?: number;
    }) => {
      /* no-op — volume is derived from on-chain events, not recorded off-chain */
    },
    []
  );

  return { recordVolume };
}

// ---------------------------------------------------------------------------
// On-chain volume (read directly from Lunex contract event logs on Arc)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_KEY = "lunex:onchain-volume";

interface VolumeBreakdown {
  swapUsd: number;
  liquidityUsd: number;
  vaultUsd: number;
  totalUsd: number;
  swapCount: number;
}

const ZERO: VolumeBreakdown = { swapUsd: 0, liquidityUsd: 0, vaultUsd: 0, totalUsd: 0, swapCount: 0 };

let memoryCache: { at: number; data: VolumeBreakdown } | null = null;

/** Sum the USD value of every swap (the USDC leg is always exact). */
function sumSwapVolume(logs: ExplorerLog[]): { usd: number; count: number } {
  let usd = 0;
  for (const log of logs) {
    const soldId = logWord(log.data, 0);
    const tokensSold = logWord(log.data, 1);
    const tokensBought = logWord(log.data, 3);
    // index 0 = USDC, index 1 = EURC. Value the USDC leg of the trade.
    const usdcLeg = soldId === 0n ? tokensSold : tokensBought;
    usd += Number(usdcLeg) / STABLE_DECIMALS;
  }
  return { usd, count: logs.length };
}

/** Sum add-liquidity notional (both stablecoin legs, valued 1:1 in USD). */
function sumLiquidityVolume(logs: ExplorerLog[]): number {
  let usd = 0;
  for (const log of logs) {
    usd += (Number(logWord(log.data, 0)) + Number(logWord(log.data, 1))) / STABLE_DECIMALS;
  }
  return usd;
}

/** Sum ERC-4626 vault deposit/withdraw assets (data word 0). */
function sumVaultVolume(logs: ExplorerLog[]): number {
  let usd = 0;
  for (const log of logs) usd += Number(logWord(log.data, 0)) / STABLE_DECIMALS;
  return usd;
}

function loadCache(): VolumeBreakdown | null {
  if (memoryCache && Date.now() - memoryCache.at < CACHE_TTL_MS) return memoryCache.data;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: VolumeBreakdown };
    if (Date.now() - parsed.at < CACHE_TTL_MS) {
      memoryCache = parsed;
      return parsed.data;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveCache(data: VolumeBreakdown) {
  const entry = { at: Date.now(), data };
  memoryCache = entry;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

/**
 * All-time protocol volume (USD), broken down by source, read live from Arc
 * contract event logs. Cached for a few minutes so navigation stays snappy.
 */
export async function fetchOnchainVolume(): Promise<VolumeBreakdown> {
  const cached = loadCache();
  if (cached) return cached;

  try {
    const [swaps, adds, usdcDep, usdcWd, eurcDep, eurcWd] = await Promise.all([
      fetchAllLogs(CONTRACTS.LUNEX_SWAP_POOL, ARC_TOPICS.tokenExchange),
      fetchAllLogs(CONTRACTS.LUNEX_SWAP_POOL, ARC_TOPICS.addLiquidity),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_USDC, ARC_TOPICS.deposit),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_USDC, ARC_TOPICS.withdraw),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_EURC, ARC_TOPICS.deposit),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_EURC, ARC_TOPICS.withdraw),
    ]);

    const swap = sumSwapVolume(swaps);
    const liquidityUsd = sumLiquidityVolume(adds);
    const vaultUsd =
      sumVaultVolume(usdcDep) + sumVaultVolume(usdcWd) + sumVaultVolume(eurcDep) + sumVaultVolume(eurcWd);

    const breakdown: VolumeBreakdown = {
      swapUsd: swap.usd,
      liquidityUsd,
      vaultUsd,
      totalUsd: swap.usd + liquidityUsd + vaultUsd,
      swapCount: swap.count,
    };
    saveCache(breakdown);
    return breakdown;
  } catch {
    return cached ?? ZERO;
  }
}

/** Total all-time protocol volume (USD). Returns 0 if the explorer is unreachable. */
export async function fetchTotalVolumeUsd(): Promise<number> {
  const { totalUsd } = await fetchOnchainVolume();
  return totalUsd;
}
