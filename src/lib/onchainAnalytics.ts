/**
 * Live, all-time analytics for Lunex on Arc — read directly from on-chain
 * contract events (via Arc's indexed explorer) and contract state (via RPC).
 * Powers the public Analytics dashboard. No off-chain database.
 */
import { createPublicClient, http } from "viem";
import { arcTestnet, CONTRACTS } from "@/config/wagmi";
import { stableSwapAbi, vaultAbi } from "@/config/abis";
import {
  ARC_TOPICS,
  STABLE_DECIMALS,
  fetchAllLogs,
  logWord,
  logTime,
  topicAddress,
  type ExplorerLog,
} from "@/lib/arcLogs";

const DAY = 86_400; // seconds
const SERIES_DAYS = 30;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_KEY = "lunex:onchain-analytics";

export interface DailyPoint {
  day: number; // unix seconds, midnight UTC
  label: string; // "Jun 18"
  volumeUsd: number;
  swaps: number;
}

export interface VaultStat {
  symbol: "USDC" | "EURC";
  tvlUsd: number;
  pricePerShare: number; // assets per share (≈1.0 at inception; >1 = yield accrued)
  yieldPct: number; // (pricePerShare - 1) * 100
}

export interface ProtocolAnalytics {
  // Volume (USD, all-time)
  swapVolumeUsd: number;
  liquidityVolumeUsd: number;
  vaultVolumeUsd: number;
  totalVolumeUsd: number;
  usdcToEurcUsd: number;
  eurcToUsdcUsd: number;
  // Counts
  swapCount: number;
  liquidityCount: number;
  vaultTxCount: number;
  totalTxCount: number;
  // TVL
  poolTvlUsd: number;
  vaultTvlUsd: number;
  totalTvlUsd: number;
  // Pool
  poolUsdc: number;
  poolEurc: number;
  poolFeePct: number;
  poolAprPct: number;
  // Vaults
  vaults: VaultStat[];
  // Active wallets
  allTimeWallets: number;
  dau: number;
  wau: number;
  mau: number;
  // Time series (last 30 days)
  daily: DailyPoint[];
  // CCTP (best-effort; cross-chain attribution is not Lunex-specific)
  cctpMessages: number | null;
  // meta
  generatedAt: number;
}

const client = createPublicClient({ chain: arcTestnet, transport: http() });

function actorsWithTime(logs: ExplorerLog[], topicIndex: number): { actor: string; t: number }[] {
  const out: { actor: string; t: number }[] = [];
  for (const log of logs) {
    const actor = topicAddress(log, topicIndex);
    if (actor) out.push({ actor, t: logTime(log) });
  }
  return out;
}

function swapUsd(log: ExplorerLog): { usd: number; usdcToEurc: boolean } {
  const soldId = logWord(log.data, 0);
  const tokensSold = logWord(log.data, 1);
  const tokensBought = logWord(log.data, 3);
  // index 0 = USDC, index 1 = EURC; value the USDC leg exactly.
  const usdcToEurc = soldId === 0n;
  const usdcLeg = usdcToEurc ? tokensSold : tokensBought;
  return { usd: Number(usdcLeg) / STABLE_DECIMALS, usdcToEurc };
}

function dayLabel(daySec: number): string {
  const d = new Date(daySec * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

async function readPoolTvl(): Promise<{ usdc: number; eurc: number; feePct: number }> {
  try {
    const read = client.readContract as (args: unknown) => Promise<unknown>;
    const [balances, fee] = await Promise.all([
      read({ address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "get_balances" }) as Promise<readonly [bigint, bigint]>,
      (read({ address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "fee" }) as Promise<bigint>).catch(() => 0n),
    ]);
    const usdc = Number(balances[0]) / STABLE_DECIMALS;
    const eurc = Number(balances[1]) / STABLE_DECIMALS;
    // Curve-style fee is 1e10-scaled (e.g. 4000000 = 0.04%). Fall back gracefully.
    const feePct = fee > 0n ? Number(fee) / 1e10 * 100 : 0.04;
    return { usdc, eurc, feePct };
  } catch {
    return { usdc: 0, eurc: 0, feePct: 0.04 };
  }
}

async function readVault(address: `0x${string}`, symbol: "USDC" | "EURC"): Promise<VaultStat> {
  try {
    const read = client.readContract as (args: unknown) => Promise<unknown>;
    const [assets, supply] = await Promise.all([
      read({ address, abi: vaultAbi, functionName: "totalAssets" }) as Promise<bigint>,
      read({ address, abi: vaultAbi, functionName: "totalSupply" }) as Promise<bigint>,
    ]);
    const tvlUsd = Number(assets) / STABLE_DECIMALS;
    const pricePerShare = supply > 0n ? Number(assets) / Number(supply) : 1;
    return { symbol, tvlUsd, pricePerShare, yieldPct: (pricePerShare - 1) * 100 };
  } catch {
    return { symbol, tvlUsd: 0, pricePerShare: 1, yieldPct: 0 };
  }
}

/** Best-effort CCTP outbound message count from Arc (cross-chain, not Lunex-only). */
async function readCctpMessages(): Promise<number | null> {
  try {
    const logs = await fetchAllLogs("0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275", ARC_TOPICS.messageSent);
    return logs.length || null;
  } catch {
    return null;
  }
}

function loadCache(): ProtocolAnalytics | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: ProtocolAnalytics };
    if (Date.now() - parsed.at < CACHE_TTL_MS) return parsed.data;
  } catch {
    /* ignore */
  }
  return null;
}

function saveCache(data: ProtocolAnalytics) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* ignore */
  }
}

/** Fetch the full live analytics set for the public dashboard. */
export async function fetchProtocolAnalytics(force = false): Promise<ProtocolAnalytics> {
  if (!force) {
    const cached = loadCache();
    if (cached) return cached;
  }

  const [swaps, adds, usdcDep, usdcWd, eurcDep, eurcWd, pool, usdcVault, eurcVault, cctpMessages] =
    await Promise.all([
      fetchAllLogs(CONTRACTS.LUNEX_SWAP_POOL, ARC_TOPICS.tokenExchange),
      fetchAllLogs(CONTRACTS.LUNEX_SWAP_POOL, ARC_TOPICS.addLiquidity),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_USDC, ARC_TOPICS.deposit),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_USDC, ARC_TOPICS.withdraw),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_EURC, ARC_TOPICS.deposit),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_EURC, ARC_TOPICS.withdraw),
      readPoolTvl(),
      readVault(CONTRACTS.LUNE_VAULT_USDC, "USDC"),
      readVault(CONTRACTS.LUNE_VAULT_EURC, "EURC"),
      readCctpMessages(),
    ]);

  // ---- Volume + directional split + daily series ----
  let swapVolumeUsd = 0;
  let usdcToEurcUsd = 0;
  let eurcToUsdcUsd = 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const todayMidnight = Math.floor(nowSec / DAY) * DAY;
  const seriesStart = todayMidnight - (SERIES_DAYS - 1) * DAY;
  const dailyMap = new Map<number, { volumeUsd: number; swaps: number }>();
  for (let i = 0; i < SERIES_DAYS; i++) {
    dailyMap.set(seriesStart + i * DAY, { volumeUsd: 0, swaps: 0 });
  }

  for (const log of swaps) {
    const { usd, usdcToEurc } = swapUsd(log);
    swapVolumeUsd += usd;
    if (usdcToEurc) usdcToEurcUsd += usd;
    else eurcToUsdcUsd += usd;
    const t = logTime(log);
    if (t >= seriesStart) {
      const bucket = Math.floor(t / DAY) * DAY;
      const cell = dailyMap.get(bucket);
      if (cell) {
        cell.volumeUsd += usd;
        cell.swaps += 1;
      }
    }
  }

  const liquidityVolumeUsd = adds.reduce(
    (sum, log) => sum + (Number(logWord(log.data, 0)) + Number(logWord(log.data, 1))) / STABLE_DECIMALS,
    0,
  );
  const vaultLogs = [...usdcDep, ...usdcWd, ...eurcDep, ...eurcWd];
  const vaultVolumeUsd = vaultLogs.reduce((sum, log) => sum + Number(logWord(log.data, 0)) / STABLE_DECIMALS, 0);

  const daily: DailyPoint[] = Array.from(dailyMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([day, v]) => ({ day, label: dayLabel(day), volumeUsd: v.volumeUsd, swaps: v.swaps }));

  // ---- Active wallets (all-time + rolling windows) ----
  const events = [
    ...actorsWithTime(swaps, 1),
    ...actorsWithTime(adds, 1),
    ...actorsWithTime(usdcDep, 1),
    ...actorsWithTime(usdcWd, 1),
    ...actorsWithTime(eurcDep, 1),
    ...actorsWithTime(eurcWd, 1),
  ];
  const allTime = new Set<string>();
  const dauSet = new Set<string>();
  const wauSet = new Set<string>();
  const mauSet = new Set<string>();
  for (const { actor, t } of events) {
    allTime.add(actor);
    if (t >= nowSec - DAY) dauSet.add(actor);
    if (t >= nowSec - 7 * DAY) wauSet.add(actor);
    if (t >= nowSec - 30 * DAY) mauSet.add(actor);
  }

  // ---- TVL + APR ----
  const poolTvlUsd = pool.usdc + pool.eurc;
  const vaults = [usdcVault, eurcVault];
  const vaultTvlUsd = vaults.reduce((s, v) => s + v.tvlUsd, 0);
  const totalTvlUsd = poolTvlUsd + vaultTvlUsd;
  // APR from trailing 30-day swap volume and the pool fee.
  const trailing30Vol = daily.reduce((s, d) => s + d.volumeUsd, 0);
  const annualFees = trailing30Vol * (pool.feePct / 100) * (365 / SERIES_DAYS);
  const poolAprPct = poolTvlUsd > 0 ? (annualFees / poolTvlUsd) * 100 : 0;

  const result: ProtocolAnalytics = {
    swapVolumeUsd,
    liquidityVolumeUsd,
    vaultVolumeUsd,
    totalVolumeUsd: swapVolumeUsd + liquidityVolumeUsd + vaultVolumeUsd,
    usdcToEurcUsd,
    eurcToUsdcUsd,
    swapCount: swaps.length,
    liquidityCount: adds.length,
    vaultTxCount: vaultLogs.length,
    totalTxCount: swaps.length + adds.length + vaultLogs.length,
    poolTvlUsd,
    vaultTvlUsd,
    totalTvlUsd,
    poolUsdc: pool.usdc,
    poolEurc: pool.eurc,
    poolFeePct: pool.feePct,
    poolAprPct,
    vaults,
    allTimeWallets: allTime.size,
    dau: dauSet.size,
    wau: wauSet.size,
    mau: mauSet.size,
    daily,
    cctpMessages,
    generatedAt: Date.now(),
  };
  saveCache(result);
  return result;
}
