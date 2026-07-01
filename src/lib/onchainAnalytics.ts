/**
 * Live, all-time analytics for Lunex on Arc - read directly from onchain
 * contract events (via Arc's indexed explorer) and contract state (via RPC).
 * Powers the public Analytics dashboard. No off-chain database.
 *
 * Performance: uses an incremental checkpoint (per-contract block cursors +
 * accumulated totals). After the first full scan, only new events since each
 * cursor are fetched — subsequent loads complete in < 1 second.
 */
import { createPublicClient, http } from "viem";
import { arcTestnet, CONTRACTS, TOKENS } from "@/config/wagmi";
import { stableSwapAbi, vaultAbi } from "@/config/abis";
import { LUNEX_TREASURY } from "@/features/bridge/config/bridgeConfig";
import {
  ARC_TOPICS,
  BRIDGE_FEE_RATE,
  POOL_DEPLOY_BLOCK,
  STABLE_DECIMALS,
  addressTopic,
  fetchAllLogs,
  logWord,
  logTime,
  topicAddress,
  type ExplorerLog,
} from "@/lib/arcLogs";

const DAY = 86_400;
const SERIES_DAYS = 30;
const RECENT_WINDOW_SEC = 32 * DAY;
const MAX_RECENT_EVENTS = 100_000; // safety cap for localStorage
const CACHE_TTL_MS = 30 * 60 * 1000; // serve stale while refreshing in bg
const ALL_PAGES = 500;

// Versioned — bump when shapes change to bust stale entries.
const CACHE_KEY = "lunex:onchain-analytics:v8";
const CHECKPOINT_KEY = "lunex:log-checkpoint:v2";

// ── Public types ──────────────────────────────────────────────────────────────

export interface DailyPoint {
  day: number;
  label: string;
  volumeUsd: number;
  swaps: number;
}

export interface DailyWallets {
  day: number;
  label: string;
  wallets: number;
}

export interface VaultStat {
  symbol: "USDC" | "EURC" | "USDT";
  tvlUsd: number;
  pricePerShare: number;
  yieldPct: number;
}

export interface ProtocolAnalytics {
  swapVolumeUsd: number;
  liquidityVolumeUsd: number;
  vaultVolumeUsd: number;
  bridgeVolumeUsd: number;
  bridgeFeesUsd: number;
  swapAdminFeesUsd: number;
  treasuryRevenueUsd: number;
  totalVolumeUsd: number;
  usdcToEurcUsd: number;
  eurcToUsdcUsd: number;
  usdcToUsdtUsd: number;
  usdtToUsdcUsd: number;
  eurcToUsdtUsd: number;
  usdtToEurcUsd: number;
  swapCount: number;
  liquidityCount: number;
  vaultTxCount: number;
  bridgeCount: number;
  totalTxCount: number;
  poolTvlUsd: number;
  vaultTvlUsd: number;
  totalTvlUsd: number;
  poolUsdc: number;
  poolEurc: number;
  pool2Usdc: number;
  pool2Usdt: number;
  pool3Eurc: number;
  pool3Usdt: number;
  poolFeePct: number;
  poolAprPct: number;
  vaults: VaultStat[];
  allTimeWallets: number;
  dau: number;
  wau: number;
  mau: number;
  daily: DailyPoint[];
  dailyWallets: DailyWallets[];
  treasuryAddress: string;
  generatedAt: number;
}

// ── Checkpoint types (incremental scan state) ─────────────────────────────────

interface CachedEvent {
  a: string;   // actor address
  t: number;   // unix timestamp
  u?: number;  // usd amount (swap events only)
  d?: number;  // directional index 0-5 (swap events only)
}

interface Checkpoint {
  version: 2;
  cursors: Record<string, number>; // streamKey → next block to fetch from
  acc: {
    swapVolumeUsd: number; swapCount: number;
    dir: [number, number, number, number, number, number];
    liquidityVolumeUsd: number; liquidityCount: number;
    vaultVolumeUsd: number; vaultTxCount: number;
    wallets: string[];
    bridgeFeesUsd: number; bridgeVolumeUsd: number; bridgeCount: number;
    swapAdminFeesUsd: number; treasuryRevenueUsd: number;
  };
  recent: CachedEvent[];
  savedAt: number;
}

function emptyCheckpoint(): Checkpoint {
  return {
    version: 2,
    cursors: {},
    acc: {
      swapVolumeUsd: 0, swapCount: 0,
      dir: [0, 0, 0, 0, 0, 0],
      liquidityVolumeUsd: 0, liquidityCount: 0,
      vaultVolumeUsd: 0, vaultTxCount: 0,
      wallets: [],
      bridgeFeesUsd: 0, bridgeVolumeUsd: 0, bridgeCount: 0,
      swapAdminFeesUsd: 0, treasuryRevenueUsd: 0,
    },
    recent: [],
    savedAt: 0,
  };
}

function loadCheckpoint(): Checkpoint {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return emptyCheckpoint();
    const p = JSON.parse(raw) as Partial<Checkpoint>;
    if (p.version !== 2 || !p.acc || !Array.isArray(p.recent)) return emptyCheckpoint();
    return p as Checkpoint;
  } catch {
    return emptyCheckpoint();
  }
}

function saveCheckpoint(cp: Checkpoint) {
  try {
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(cp));
  } catch {
    try {
      // localStorage full — trim recent events and retry
      localStorage.setItem(CHECKPOINT_KEY, JSON.stringify({ ...cp, recent: cp.recent.slice(-10_000) }));
    } catch { /* give up */ }
  }
}

// ── Short-lived analytics result cache (TTL dedup) ────────────────────────────

function loadCache(allowStale = false): ProtocolAnalytics | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: ProtocolAnalytics };
    const d = parsed.data;
    const valid = d && Array.isArray(d.daily) && Array.isArray(d.dailyWallets) && Array.isArray(d.vaults);
    if (valid && (allowStale || Date.now() - parsed.at < CACHE_TTL_MS)) return d;
  } catch { /* ignore */ }
  return null;
}

function saveCache(data: ProtocolAnalytics) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch { /* ignore */ }
}

/** Return last-good analytics immediately (ignores TTL — used for instant display). */
export function getCachedAnalytics(): ProtocolAnalytics | null {
  return loadCache(true);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const client = createPublicClient({ chain: arcTestnet, transport: http() });

function dayLabel(daySec: number): string {
  return new Date(daySec * 1000).toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

function cursorFor(cp: Checkpoint, key: string): number {
  return cp.cursors[key] ?? POOL_DEPLOY_BLOCK;
}

function maxBlockOf(logs: ExplorerLog[]): number {
  let m = 0;
  for (const log of logs) {
    const b = parseInt(log.blockNumber, 16);
    if (b > m) m = b;
  }
  return m;
}

async function readPoolBalances(address: `0x${string}`): Promise<{ bal0: number; bal1: number; feePct: number }> {
  try {
    const read = client.readContract as (args: unknown) => Promise<unknown>;
    const [balances, fee] = await Promise.all([
      read({ address, abi: stableSwapAbi, functionName: "get_balances" }) as Promise<readonly [bigint, bigint]>,
      (read({ address, abi: stableSwapAbi, functionName: "fee" }) as Promise<bigint>).catch(() => 0n),
    ]);
    return {
      bal0: Number(balances[0]) / STABLE_DECIMALS,
      bal1: Number(balances[1]) / STABLE_DECIMALS,
      feePct: fee > 0n ? (Number(fee) / 1e10) * 100 : 0.04,
    };
  } catch {
    return { bal0: 0, bal1: 0, feePct: 0.04 };
  }
}

async function readVault(address: `0x${string}`, symbol: "USDC" | "EURC" | "USDT"): Promise<VaultStat> {
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

// ── Main analytics fetch ──────────────────────────────────────────────────────

export async function fetchProtocolAnalytics(force = false): Promise<ProtocolAnalytics> {
  if (!force) {
    const cached = loadCache();
    if (cached) return cached;
  }

  try {
    const cp = loadCheckpoint();

    // ── Fetch delta events (only new since each cursor) in parallel ───────────
    const [
      swapsMain, addsMain,
      swapsUsdcUsdt, addsUsdcUsdt,
      swapsEurcUsdt, addsEurcUsdt,
      usdcDep, usdcWd,
      eurcDep, eurcWd,
      usdtDep, usdtWd,
      pool1, pool2, pool3,
      usdcVault, eurcVault, usdtVault,
      bridgeLogs,
    ] = await Promise.all([
      fetchAllLogs(CONTRACTS.LUNEX_SWAP_POOL,  ARC_TOPICS.tokenExchange, cursorFor(cp, "swapsMain"),     ALL_PAGES),
      fetchAllLogs(CONTRACTS.LUNEX_SWAP_POOL,  ARC_TOPICS.addLiquidity,  cursorFor(cp, "addsMain"),      ALL_PAGES),
      fetchAllLogs(CONTRACTS.POOL_USDC_USDT,   ARC_TOPICS.tokenExchange, cursorFor(cp, "swapsUsdcUsdt"), ALL_PAGES),
      fetchAllLogs(CONTRACTS.POOL_USDC_USDT,   ARC_TOPICS.addLiquidity,  cursorFor(cp, "addsUsdcUsdt"),  ALL_PAGES),
      fetchAllLogs(CONTRACTS.POOL_EURC_USDT,   ARC_TOPICS.tokenExchange, cursorFor(cp, "swapsEurcUsdt"), ALL_PAGES),
      fetchAllLogs(CONTRACTS.POOL_EURC_USDT,   ARC_TOPICS.addLiquidity,  cursorFor(cp, "addsEurcUsdt"),  ALL_PAGES),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_USDC,  ARC_TOPICS.deposit,       cursorFor(cp, "usdcDep"),       ALL_PAGES),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_USDC,  ARC_TOPICS.withdraw,      cursorFor(cp, "usdcWd"),        ALL_PAGES),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_EURC,  ARC_TOPICS.deposit,       cursorFor(cp, "eurcDep"),       ALL_PAGES),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_EURC,  ARC_TOPICS.withdraw,      cursorFor(cp, "eurcWd"),        ALL_PAGES),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_USDT,  ARC_TOPICS.deposit,       cursorFor(cp, "usdtDep"),       ALL_PAGES),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_USDT,  ARC_TOPICS.withdraw,      cursorFor(cp, "usdtWd"),        ALL_PAGES),
      readPoolBalances(CONTRACTS.LUNEX_SWAP_POOL),
      readPoolBalances(CONTRACTS.POOL_USDC_USDT),
      readPoolBalances(CONTRACTS.POOL_EURC_USDT),
      readVault(CONTRACTS.LUNE_VAULT_USDC, "USDC"),
      readVault(CONTRACTS.LUNE_VAULT_EURC, "EURC"),
      readVault(CONTRACTS.LUNE_VAULT_USDT, "USDT"),
      fetchAllLogs(
        TOKENS.USDC.address, ARC_TOPICS.transfer, cursorFor(cp, "bridge"), ALL_PAGES,
        `&topic2=${addressTopic(LUNEX_TREASURY)}&topic0_2_opr=and`,
      ),
    ]);

    // ── Merge new events into accumulated checkpoint state ────────────────────
    const nowSec = Math.floor(Date.now() / 1000);
    const recentCutoff = nowSec - RECENT_WINDOW_SEC;

    const acc = { ...cp.acc, dir: [...cp.acc.dir] as [number, number, number, number, number, number] };
    const walletSet = new Set(cp.acc.wallets);
    const newCursors = { ...cp.cursors };
    let recent: CachedEvent[] = cp.recent.filter(e => e.t >= recentCutoff);

    // Swap events — 3 pools
    // dir index: 0=usdcToEurc 1=eurcToUsdc 2=usdcToUsdt 3=usdtToUsdc 4=eurcToUsdt 5=usdtToEurc
    const swapGroups: [ExplorerLog[], "usdc_eurc" | "usdc_usdt" | "eurc_usdt", string][] = [
      [swapsMain,     "usdc_eurc", "swapsMain"],
      [swapsUsdcUsdt, "usdc_usdt", "swapsUsdcUsdt"],
      [swapsEurcUsdt, "eurc_usdt", "swapsEurcUsdt"],
    ];
    for (const [logs, pair, key] of swapGroups) {
      const mb = maxBlockOf(logs);
      if (mb > 0) newCursors[key] = mb + 1;
      for (const log of logs) {
        const soldId       = logWord(log.data, 0);
        const tokensSold   = logWord(log.data, 1);
        const tokensBought = logWord(log.data, 3);
        let usd: number;
        let dir: number;
        if (pair === "usdc_eurc") {
          const usdcLeg = soldId === 0n ? tokensSold : tokensBought;
          usd = Number(usdcLeg) / STABLE_DECIMALS;
          dir = soldId === 0n ? 0 : 1;
        } else {
          usd = Number(tokensSold) / STABLE_DECIMALS;
          dir = pair === "usdc_usdt" ? (soldId === 0n ? 2 : 3) : (soldId === 0n ? 4 : 5);
        }
        acc.swapVolumeUsd += usd;
        acc.swapCount += 1;
        acc.dir[dir] += usd;
        const actor = topicAddress(log, 1) ?? "";
        walletSet.add(actor);
        recent.push({ a: actor, t: logTime(log), u: usd, d: dir });
      }
    }

    // Liquidity events — 3 pools
    const addGroups: [ExplorerLog[], string][] = [
      [addsMain,     "addsMain"],
      [addsUsdcUsdt, "addsUsdcUsdt"],
      [addsEurcUsdt, "addsEurcUsdt"],
    ];
    for (const [logs, key] of addGroups) {
      const mb = maxBlockOf(logs);
      if (mb > 0) newCursors[key] = mb + 1;
      for (const log of logs) {
        acc.liquidityVolumeUsd +=
          (Number(logWord(log.data, 0)) + Number(logWord(log.data, 1))) / STABLE_DECIMALS;
        acc.liquidityCount += 1;
        const actor = topicAddress(log, 1) ?? "";
        walletSet.add(actor);
        recent.push({ a: actor, t: logTime(log) });
      }
    }

    // Vault deposit/withdraw events — 3 vaults × 2 event types
    const vaultGroups: [ExplorerLog[], string][] = [
      [usdcDep, "usdcDep"], [usdcWd, "usdcWd"],
      [eurcDep, "eurcDep"], [eurcWd, "eurcWd"],
      [usdtDep, "usdtDep"], [usdtWd, "usdtWd"],
    ];
    for (const [logs, key] of vaultGroups) {
      const mb = maxBlockOf(logs);
      if (mb > 0) newCursors[key] = mb + 1;
      for (const log of logs) {
        acc.vaultVolumeUsd += Number(logWord(log.data, 0)) / STABLE_DECIMALS;
        acc.vaultTxCount += 1;
        const actor = topicAddress(log, 1) ?? "";
        walletSet.add(actor);
        recent.push({ a: actor, t: logTime(log) });
      }
    }

    // Bridge / treasury USDC transfer events
    {
      const mb = maxBlockOf(bridgeLogs);
      if (mb > 0) newCursors["bridge"] = mb + 1;
      const pool = CONTRACTS.LUNEX_SWAP_POOL.toLowerCase();
      const zero = "0x0000000000000000000000000000000000000000";
      for (const log of bridgeLogs) {
        const amount = Number(logWord(log.data, 0)) / STABLE_DECIMALS;
        acc.treasuryRevenueUsd += amount;
        const from = topicAddress(log, 1);
        if (from === pool) {
          acc.swapAdminFeesUsd += amount;
        } else if (from !== zero && from !== null) {
          acc.bridgeFeesUsd += amount;
          acc.bridgeCount += 1;
        }
      }
      acc.bridgeVolumeUsd = acc.bridgeFeesUsd / BRIDGE_FEE_RATE;
    }

    acc.wallets = Array.from(walletSet);
    if (recent.length > MAX_RECENT_EVENTS) recent = recent.slice(-MAX_RECENT_EVENTS);

    // ── Rolling-window stats from recent events ───────────────────────────────
    const todayMidnight = Math.floor(nowSec / DAY) * DAY;
    const seriesStart   = todayMidnight - (SERIES_DAYS - 1) * DAY;

    const dailyMap = new Map<number, { volumeUsd: number; swaps: number }>();
    for (let i = 0; i < SERIES_DAYS; i++) dailyMap.set(seriesStart + i * DAY, { volumeUsd: 0, swaps: 0 });

    const dauSet = new Set<string>();
    const wauSet = new Set<string>();
    const mauSet = new Set<string>();
    const dailyWalletSets = new Map<number, Set<string>>();
    for (let i = 0; i < SERIES_DAYS; i++) dailyWalletSets.set(seriesStart + i * DAY, new Set());

    for (const e of recent) {
      if (e.t >= nowSec - DAY)      dauSet.add(e.a);
      if (e.t >= nowSec - 7 * DAY)  wauSet.add(e.a);
      if (e.t >= nowSec - 30 * DAY) mauSet.add(e.a);
      if (e.t >= seriesStart) {
        const bucket = Math.floor(e.t / DAY) * DAY;
        dailyWalletSets.get(bucket)?.add(e.a);
        if (e.u !== undefined) {
          const cell = dailyMap.get(bucket);
          if (cell) { cell.volumeUsd += e.u; cell.swaps += 1; }
        }
      }
    }

    const daily: DailyPoint[] = Array.from(dailyMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, v]) => ({ day, label: dayLabel(day), volumeUsd: v.volumeUsd, swaps: v.swaps }));

    const dailyWallets: DailyWallets[] = Array.from(dailyWalletSets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, set]) => ({ day, label: dayLabel(day), wallets: set.size }));

    // ── TVL & APR ─────────────────────────────────────────────────────────────
    const poolUsdc  = pool1.bal0; const poolEurc  = pool1.bal1;
    const pool2Usdc = pool2.bal0; const pool2Usdt = pool2.bal1;
    const pool3Eurc = pool3.bal0; const pool3Usdt = pool3.bal1;

    const vaults: VaultStat[]  = [usdcVault, eurcVault, usdtVault];
    const poolTvlUsd  = poolUsdc + poolEurc + pool2Usdc + pool2Usdt + pool3Eurc + pool3Usdt;
    const vaultTvlUsd = vaults.reduce((s, v) => s + v.tvlUsd, 0);

    const trailing30Vol = daily.reduce((s, d) => s + d.volumeUsd, 0);
    const annualFees    = trailing30Vol * (pool1.feePct / 100) * (365 / SERIES_DAYS);
    const poolAprPct    = poolTvlUsd > 0 ? (annualFees / poolTvlUsd) * 100 : 0;

    // ── Save updated checkpoint ───────────────────────────────────────────────
    saveCheckpoint({ version: 2, cursors: newCursors, acc, recent, savedAt: Date.now() });

    const result: ProtocolAnalytics = {
      swapVolumeUsd:      acc.swapVolumeUsd,
      liquidityVolumeUsd: acc.liquidityVolumeUsd,
      vaultVolumeUsd:     acc.vaultVolumeUsd,
      bridgeVolumeUsd:    acc.bridgeVolumeUsd,
      bridgeFeesUsd:      acc.bridgeFeesUsd,
      swapAdminFeesUsd:   acc.swapAdminFeesUsd,
      treasuryRevenueUsd: acc.treasuryRevenueUsd,
      totalVolumeUsd:
        acc.swapVolumeUsd + acc.liquidityVolumeUsd + acc.vaultVolumeUsd + acc.bridgeVolumeUsd,
      usdcToEurcUsd: acc.dir[0], eurcToUsdcUsd: acc.dir[1],
      usdcToUsdtUsd: acc.dir[2], usdtToUsdcUsd: acc.dir[3],
      eurcToUsdtUsd: acc.dir[4], usdtToEurcUsd: acc.dir[5],
      swapCount:      acc.swapCount,
      liquidityCount: acc.liquidityCount,
      vaultTxCount:   acc.vaultTxCount,
      bridgeCount:    acc.bridgeCount,
      totalTxCount:   acc.swapCount + acc.liquidityCount + acc.vaultTxCount + acc.bridgeCount,
      poolTvlUsd, vaultTvlUsd, totalTvlUsd: poolTvlUsd + vaultTvlUsd,
      poolUsdc, poolEurc, pool2Usdc, pool2Usdt, pool3Eurc, pool3Usdt,
      poolFeePct: pool1.feePct,
      poolAprPct,
      vaults,
      allTimeWallets: walletSet.size,
      dau: dauSet.size, wau: wauSet.size, mau: mauSet.size,
      daily, dailyWallets,
      treasuryAddress: LUNEX_TREASURY,
      generatedAt: Date.now(),
    };

    saveCache(result);
    return result;
  } catch (e) {
    const stale = loadCache(true);
    if (stale) return stale;
    throw e;
  }
}
