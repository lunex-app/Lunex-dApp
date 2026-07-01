/**
 * Vercel Serverless Function (Node.js runtime) — server-side analytics scan.
 *
 * Reads all Lunex protocol events from the Arc explorer and contract state from
 * the RPC, then returns the ProtocolAnalytics JSON.
 *
 * Cache-Control: s-maxage=300, stale-while-revalidate=86400
 *   → Vercel CDN caches the response for 5 minutes. The first request per
 *     cache window triggers the scan (~5 s); every other request is served
 *     from the CDN in < 100 ms. After 5 min, stale is served immediately
 *     while the CDN silently revalidates in the background.
 *
 * The browser calls this first; falls back to its own incremental checkpoint
 * scan if the endpoint is unavailable or slow.
 */

import { createPublicClient, http } from "viem";

// ── Inlined constants (no @/ path aliases available in api/) ─────────────────

const ARC_RPC      = "https://rpc.testnet.arc.network";
const EXPLORER_URL = "https://testnet.arcscan.app";
const DEPLOY_BLOCK = 31_829_533;
const DECIMALS     = 1e6;
const BRIDGE_FEE   = 0.001;
const DAY          = 86_400;
const SERIES_DAYS  = 30;
const MAX_PAGES    = 100; // 100k events per stream; keeps scan under 25 s

const arcChain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] as const } },
} as const;

const C = {
  LUNEX_SWAP_POOL: "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8",
  POOL_USDC_USDT:  "0x8e60d788955CaBb247D2c003C77AdAF44C566cD3",
  POOL_EURC_USDT:  "0xF04E8D25BF97cda82147596ba887bdF793F574DD",
  LUNE_VAULT_USDC: "0x66CF9CA9D75FD62438C6E254bA35E61775EF9496",
  LUNE_VAULT_EURC: "0xcF2C839B12ECf6D9eEcd4607521B73fcFb7E8713",
  LUNE_VAULT_USDT: "0x60810D1a8b40B78EA82Ea16CA356De7eD9eb19dD",
  USDC:            "0x3600000000000000000000000000000000000000",
  TREASURY:        "0xC81b2328f7f04DC667428DA9a84CE627338873fd",
} as const;

const T = {
  tokenExchange: "0xb2e76ae99761dc136e598d4a629bb347eccb9532a5f8bbd72e18467c3c34cc98",
  addLiquidity:  "0xd92dda7384b5f0fa573be9bbf63d63ac81a5bbb08ebc31f00c0f066e50239609",
  deposit:       "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7",
  withdraw:      "0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db",
  transfer:      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
} as const;

const POOL_ABI = [
  { name: "get_balances", type: "function", inputs: [],
    outputs: [{ type: "uint256[]" }], stateMutability: "view" },
  { name: "fee", type: "function", inputs: [],
    outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

const VAULT_ABI = [
  { name: "totalAssets", type: "function", inputs: [],
    outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "totalSupply", type: "function", inputs: [],
    outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Log {
  blockNumber: string;
  logIndex: string;
  transactionHash: string;
  timeStamp: string;
  topics: (string | null)[];
  data: string;
}

// ── Log helpers ───────────────────────────────────────────────────────────────

function logWord(data: string, i: number): bigint {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const slice = hex.slice(i * 64, (i + 1) * 64);
  return slice.length < 64 ? 0n : BigInt("0x" + slice);
}

function logTime(log: Log): number {
  const t = parseInt(log.timeStamp, 16);
  return Number.isFinite(t) ? t : 0;
}

function topicAddr(log: Log, i: number): string | null {
  const t = log.topics[i];
  if (!t || t.length < 66) return null;
  return ("0x" + t.slice(26)).toLowerCase();
}

function addrTopic(addr: string): string {
  return "0x" + "0".repeat(24) + addr.toLowerCase().replace(/^0x/, "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Explorer log pagination ───────────────────────────────────────────────────

async function fetchPage(url: string): Promise<Log[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      const json = (await res.json()) as { result?: Log[] | string; message?: string };
      if (Array.isArray(json.result)) return json.result;
      const msg = String(json.message ?? "").toLowerCase();
      if (msg.includes("no records") || msg.includes("not found")) return [];
      lastErr = new Error(json.message || "non-array result");
    } catch (e) {
      lastErr = e;
    }
    await sleep(400 * (attempt + 1));
  }
  throw lastErr;
}

async function fetchAllLogs(
  address: string,
  topic0: string,
  fromBlock = DEPLOY_BLOCK,
  extra = "",
): Promise<Log[]> {
  const out: Log[] = [];
  const seen = new Set<string>();
  let cursor = fromBlock;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `${EXPLORER_URL}/api?module=logs&action=getLogs` +
      `&address=${address}&topic0=${topic0}${extra}&fromBlock=${cursor}&toBlock=latest`;
    const rows = await fetchPage(url);
    if (rows.length === 0) break;

    let maxB = cursor;
    for (const row of rows) {
      const key = `${row.transactionHash}:${row.logIndex}`;
      if (!seen.has(key)) { seen.add(key); out.push(row); }
      const b = parseInt(row.blockNumber, 16);
      if (b > maxB) maxB = b;
    }
    if (rows.length < 1000) break;
    if (maxB <= cursor) break;
    cursor = maxB;
  }
  return out;
}

// ── RPC helpers ───────────────────────────────────────────────────────────────

const client = createPublicClient({ chain: arcChain, transport: http(ARC_RPC) });

async function readPool(addr: string): Promise<{ bal0: number; bal1: number; feePct: number }> {
  try {
    const read = client.readContract as (a: unknown) => Promise<unknown>;
    const [bals, fee] = await Promise.all([
      read({ address: addr as `0x${string}`, abi: POOL_ABI, functionName: "get_balances" }) as Promise<readonly bigint[]>,
      (read({ address: addr as `0x${string}`, abi: POOL_ABI, functionName: "fee" }) as Promise<bigint>).catch(() => 0n),
    ]);
    return {
      bal0: Number(bals[0]) / DECIMALS,
      bal1: Number(bals[1]) / DECIMALS,
      feePct: fee > 0n ? (Number(fee) / 1e10) * 100 : 0.04,
    };
  } catch {
    return { bal0: 0, bal1: 0, feePct: 0.04 };
  }
}

async function readVault(addr: string): Promise<{ tvl: number; pps: number }> {
  try {
    const read = client.readContract as (a: unknown) => Promise<unknown>;
    const [assets, supply] = await Promise.all([
      read({ address: addr as `0x${string}`, abi: VAULT_ABI, functionName: "totalAssets" }) as Promise<bigint>,
      read({ address: addr as `0x${string}`, abi: VAULT_ABI, functionName: "totalSupply" }) as Promise<bigint>,
    ]);
    return {
      tvl: Number(assets) / DECIMALS,
      pps: supply > 0n ? Number(assets) / Number(supply) : 1,
    };
  } catch {
    return { tvl: 0, pps: 1 };
  }
}

// ── Day helpers ───────────────────────────────────────────────────────────────

function dayLabel(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

// ── Main computation ──────────────────────────────────────────────────────────

async function computeAnalytics() {
  // Fetch all event streams and live state in parallel
  const [
    swapsMain, addsMain,
    swapsUU, addsUU,
    swapsEU, addsEU,
    usdcDep, usdcWd,
    eurcDep, eurcWd,
    usdtDep, usdtWd,
    pool1, pool2, pool3,
    vUSDC, vEURC, vUSDT,
    bridgeLogs,
  ] = await Promise.all([
    fetchAllLogs(C.LUNEX_SWAP_POOL, T.tokenExchange),
    fetchAllLogs(C.LUNEX_SWAP_POOL, T.addLiquidity),
    fetchAllLogs(C.POOL_USDC_USDT,  T.tokenExchange),
    fetchAllLogs(C.POOL_USDC_USDT,  T.addLiquidity),
    fetchAllLogs(C.POOL_EURC_USDT,  T.tokenExchange),
    fetchAllLogs(C.POOL_EURC_USDT,  T.addLiquidity),
    fetchAllLogs(C.LUNE_VAULT_USDC, T.deposit),
    fetchAllLogs(C.LUNE_VAULT_USDC, T.withdraw),
    fetchAllLogs(C.LUNE_VAULT_EURC, T.deposit),
    fetchAllLogs(C.LUNE_VAULT_EURC, T.withdraw),
    fetchAllLogs(C.LUNE_VAULT_USDT, T.deposit),
    fetchAllLogs(C.LUNE_VAULT_USDT, T.withdraw),
    readPool(C.LUNEX_SWAP_POOL),
    readPool(C.POOL_USDC_USDT),
    readPool(C.POOL_EURC_USDT),
    readVault(C.LUNE_VAULT_USDC),
    readVault(C.LUNE_VAULT_EURC),
    readVault(C.LUNE_VAULT_USDT),
    fetchAllLogs(
      C.USDC, T.transfer, DEPLOY_BLOCK,
      `&topic2=${addrTopic(C.TREASURY)}&topic0_2_opr=and`,
    ),
  ]);

  const nowSec     = Math.floor(Date.now() / 1000);
  const todayMid   = Math.floor(nowSec / DAY) * DAY;
  const seriesStart = todayMid - (SERIES_DAYS - 1) * DAY;

  // Volume accumulators
  let swapVol = 0, dir0 = 0, dir1 = 0, dir2 = 0, dir3 = 0, dir4 = 0, dir5 = 0;
  let swapCount = 0;

  const dailyMap = new Map<number, { v: number; s: number }>();
  for (let i = 0; i < SERIES_DAYS; i++) dailyMap.set(seriesStart + i * DAY, { v: 0, s: 0 });

  const wallets     = new Set<string>();
  const dauSet      = new Set<string>();
  const wauSet      = new Set<string>();
  const mauSet      = new Set<string>();
  const dwSets      = new Map<number, Set<string>>();
  for (let i = 0; i < SERIES_DAYS; i++) dwSets.set(seriesStart + i * DAY, new Set());

  function trackActor(actor: string, t: number) {
    wallets.add(actor);
    if (t >= nowSec - DAY)      dauSet.add(actor);
    if (t >= nowSec - 7 * DAY)  wauSet.add(actor);
    if (t >= nowSec - 30 * DAY) mauSet.add(actor);
    if (t >= seriesStart) dwSets.get(Math.floor(t / DAY) * DAY)?.add(actor);
  }

  // Swap events
  const swapGroups: [Log[], "ue" | "uu" | "eu"][] = [
    [swapsMain, "ue"], [swapsUU, "uu"], [swapsEU, "eu"],
  ];
  for (const [logs, pair] of swapGroups) {
    for (const log of logs) {
      const soldId = logWord(log.data, 0);
      const sold   = logWord(log.data, 1);
      const bought = logWord(log.data, 3);
      let usd: number;
      if (pair === "ue") {
        const usdcLeg = soldId === 0n ? sold : bought;
        usd = Number(usdcLeg) / DECIMALS;
        if (soldId === 0n) dir0 += usd; else dir1 += usd;
      } else {
        usd = Number(sold) / DECIMALS;
        if (pair === "uu") { if (soldId === 0n) dir2 += usd; else dir3 += usd; }
        else               { if (soldId === 0n) dir4 += usd; else dir5 += usd; }
      }
      swapVol += usd;
      swapCount += 1;
      const t     = logTime(log);
      const actor = topicAddr(log, 1) ?? "";
      trackActor(actor, t);
      if (t >= seriesStart) {
        const bucket = Math.floor(t / DAY) * DAY;
        const cell   = dailyMap.get(bucket);
        if (cell) { cell.v += usd; cell.s += 1; }
      }
    }
  }

  // Liquidity events
  let liqVol = 0, liqCount = 0;
  for (const log of [...addsMain, ...addsUU, ...addsEU]) {
    liqVol += (Number(logWord(log.data, 0)) + Number(logWord(log.data, 1))) / DECIMALS;
    liqCount += 1;
    trackActor(topicAddr(log, 1) ?? "", logTime(log));
  }

  // Vault events
  let vaultVol = 0, vaultCount = 0;
  for (const log of [...usdcDep, ...usdcWd, ...eurcDep, ...eurcWd, ...usdtDep, ...usdtWd]) {
    vaultVol += Number(logWord(log.data, 0)) / DECIMALS;
    vaultCount += 1;
    trackActor(topicAddr(log, 1) ?? "", logTime(log));
  }

  // Bridge / treasury events
  let bridgeFees = 0, bridgeVol = 0, bridgeCount = 0, swapAdminFees = 0, treasuryRev = 0;
  const pool = C.LUNEX_SWAP_POOL.toLowerCase();
  const zero = "0x0000000000000000000000000000000000000000";
  for (const log of bridgeLogs) {
    const amount = Number(logWord(log.data, 0)) / DECIMALS;
    treasuryRev += amount;
    const from = topicAddr(log, 1);
    if (from === pool)             swapAdminFees += amount;
    else if (from !== zero && from) { bridgeFees += amount; bridgeCount += 1; }
  }
  bridgeVol = bridgeFees / BRIDGE_FEE;

  // Daily series
  const daily = Array.from(dailyMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([d, v]) => ({ day: d, label: dayLabel(d), volumeUsd: v.v, swaps: v.s }));

  const dailyWallets = Array.from(dwSets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([d, s]) => ({ day: d, label: dayLabel(d), wallets: s.size }));

  // TVL
  const poolTvl  = pool1.bal0 + pool1.bal1 + pool2.bal0 + pool2.bal1 + pool3.bal0 + pool3.bal1;
  const vaultTvl = vUSDC.tvl + vEURC.tvl + vUSDT.tvl;

  const trailing30Vol = daily.reduce((s, d) => s + d.volumeUsd, 0);
  const annualFees    = trailing30Vol * (pool1.feePct / 100) * (365 / SERIES_DAYS);
  const poolAprPct    = poolTvl > 0 ? (annualFees / poolTvl) * 100 : 0;

  return {
    swapVolumeUsd:      swapVol,
    liquidityVolumeUsd: liqVol,
    vaultVolumeUsd:     vaultVol,
    bridgeVolumeUsd:    bridgeVol,
    bridgeFeesUsd:      bridgeFees,
    swapAdminFeesUsd:   swapAdminFees,
    treasuryRevenueUsd: treasuryRev,
    totalVolumeUsd:     swapVol + liqVol + vaultVol + bridgeVol,
    usdcToEurcUsd: dir0, eurcToUsdcUsd: dir1,
    usdcToUsdtUsd: dir2, usdtToUsdcUsd: dir3,
    eurcToUsdtUsd: dir4, usdtToEurcUsd: dir5,
    swapCount,
    liquidityCount: liqCount,
    vaultTxCount:   vaultCount,
    bridgeCount,
    totalTxCount:   swapCount + liqCount + vaultCount + bridgeCount,
    poolTvlUsd: poolTvl, vaultTvlUsd: vaultTvl, totalTvlUsd: poolTvl + vaultTvl,
    poolUsdc:  pool1.bal0, poolEurc:  pool1.bal1,
    pool2Usdc: pool2.bal0, pool2Usdt: pool2.bal1,
    pool3Eurc: pool3.bal0, pool3Usdt: pool3.bal1,
    poolFeePct: pool1.feePct,
    poolAprPct,
    vaults: [
      { symbol: "USDC", tvlUsd: vUSDC.tvl, pricePerShare: vUSDC.pps, yieldPct: (vUSDC.pps - 1) * 100 },
      { symbol: "EURC", tvlUsd: vEURC.tvl, pricePerShare: vEURC.pps, yieldPct: (vEURC.pps - 1) * 100 },
      { symbol: "USDT", tvlUsd: vUSDT.tvl, pricePerShare: vUSDT.pps, yieldPct: (vUSDT.pps - 1) * 100 },
    ],
    allTimeWallets: wallets.size,
    dau: dauSet.size, wau: wauSet.size, mau: mauSet.size,
    daily,
    dailyWallets,
    treasuryAddress: C.TREASURY,
    generatedAt: Date.now(),
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: { method?: string }, res: {
  setHeader(k: string, v: string): void;
  status(c: number): { json(d: unknown): void; end(): void };
}) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=86400");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method && req.method !== "GET") {
    res.status(405).json({ error: "GET only" });
    return;
  }

  try {
    const data = await computeAnalytics();
    res.status(200).json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
}

export const config = { maxDuration: 60 };
