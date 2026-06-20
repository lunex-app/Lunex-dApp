#!/usr/bin/env node
/**
 * Computes full-history Lunex analytics aggregates from Arc on-chain data and
 * writes scripts/dune-export/aggregates.json. These small aggregates are inlined
 * as SQL VALUES into Dune queries (Arc isn't natively on Dune), so the Dune
 * dashboard shows the same numbers as the in-app /analytics page.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const EXPLORER = "https://testnet.arcscan.app";
const RPC = "https://rpc.testnet.arc.network";
const POOL = "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8";
const VAULT_USDC = "0x66CF9CA9D75FD62438C6E254bA35E61775EF9496";
const VAULT_EURC = "0xcF2C839B12ECf6D9eEcd4607521B73fcFb7E8713";
const USDC = "0x3600000000000000000000000000000000000000";
const TREASURY = "0xC81b2328f7f04DC667428DA9a84CE627338873fd";
const TOPIC = {
  tokenExchange: "0xb2e76ae99761dc136e598d4a629bb347eccb9532a5f8bbd72e18467c3c34cc98",
  addLiquidity: "0xd92dda7384b5f0fa573be9bbf63d63ac81a5bbb08ebc31f00c0f066e50239609",
  deposit: "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7",
  withdraw: "0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db",
  transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
};
const DEPLOY_BLOCK = 31_829_533;
const DEC = 1e6;
const FEE_RATE = 0.001;
const SEL = { get_balances: "0x14f05979", totalAssets: "0x01e1d114", totalSupply: "0x18160ddd" };

const word = (data, i) => {
  const h = data.startsWith("0x") ? data.slice(2) : data;
  const s = h.slice(i * 64, (i + 1) * 64);
  return s.length < 64 ? 0n : BigInt("0x" + s);
};
const addrTopic = (a) => "0x" + "0".repeat(24) + a.toLowerCase().replace(/^0x/, "");
const topicAddr = (l, i) => (l.topics[i] ? "0x" + l.topics[i].slice(26).toLowerCase() : null);
const tsOf = (l) => (l.timeStamp ? parseInt(l.timeStamp, 16) : 0);
const dayOf = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

async function fetchLogs(address, topic0, extra = "") {
  const out = [], seen = new Set();
  let cursor = DEPLOY_BLOCK;
  for (let p = 0; p < 200; p++) {
    const url = `${EXPLORER}/api?module=logs&action=getLogs&address=${address}&topic0=${topic0}${extra}&fromBlock=${cursor}&toBlock=latest`;
    let rows = [];
    try { const r = await fetch(url); const j = await r.json(); if (!Array.isArray(j.result)) break; rows = j.result; } catch { break; }
    if (!rows.length) break;
    let max = cursor;
    for (const row of rows) { const k = `${row.transactionHash}:${row.logIndex}`; if (!seen.has(k)) { seen.add(k); out.push(row); } const b = parseInt(row.blockNumber, 16); if (b > max) max = b; }
    if (rows.length < 1000) break; if (max <= cursor) break; cursor = max;
  }
  return out;
}
async function ethCall(to, data) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }) });
  return (await r.json()).result || "0x";
}

async function main() {
  console.log("Fetching Lunex on-chain activity…");
  const [swaps, adds, uDep, uWd, eDep, eWd, treasuryIn] = await Promise.all([
    fetchLogs(POOL, TOPIC.tokenExchange),
    fetchLogs(POOL, TOPIC.addLiquidity),
    fetchLogs(VAULT_USDC, TOPIC.deposit),
    fetchLogs(VAULT_USDC, TOPIC.withdraw),
    fetchLogs(VAULT_EURC, TOPIC.deposit),
    fetchLogs(VAULT_EURC, TOPIC.withdraw),
    fetchLogs(USDC, TOPIC.transfer, `&topic2=${addrTopic(TREASURY)}&topic0_2_opr=and`),
  ]);

  // swaps
  let swapVol = 0, u2e = 0, e2u = 0;
  const dayVol = new Map();
  const dayWallets = new Map();
  const addActor = (map, ts, actor) => { if (!actor) return; const d = dayOf(ts); if (!map.has(d)) map.set(d, new Set()); map.get(d).add(actor); };
  for (const l of swaps) {
    const soldId = word(l.data, 0);
    const usd = Number(soldId === 0n ? word(l.data, 1) : word(l.data, 3)) / DEC;
    swapVol += usd; if (soldId === 0n) u2e += usd; else e2u += usd;
    const ts = tsOf(l), d = dayOf(ts);
    const cur = dayVol.get(d) || { vol: 0, swaps: 0 }; cur.vol += usd; cur.swaps += 1; dayVol.set(d, cur);
    addActor(dayWallets, ts, topicAddr(l, 1));
  }
  const liqVol = adds.reduce((s, l) => s + (Number(word(l.data, 0)) + Number(word(l.data, 1))) / DEC, 0);
  for (const l of adds) addActor(dayWallets, tsOf(l), topicAddr(l, 1));
  const vaultLogs = [...uDep, ...uWd, ...eDep, ...eWd];
  const vaultVol = vaultLogs.reduce((s, l) => s + Number(word(l.data, 0)) / DEC, 0);
  for (const l of vaultLogs) addActor(dayWallets, tsOf(l), topicAddr(l, 1));

  // bridge fees (classified by sender)
  let bridgeVol = 0, bridgeFees = 0, swapAdminFees = 0, treasuryRevenue = 0, bridgeCount = 0;
  const bridgeDay = new Map();
  for (const l of treasuryIn) {
    const amt = Number(word(l.data, 0)) / DEC; treasuryRevenue += amt;
    const from = topicAddr(l, 1);
    if (from === POOL.toLowerCase()) { swapAdminFees += amt; continue; }
    if (from === "0x0000000000000000000000000000000000000000") continue;
    const bridged = amt / FEE_RATE; bridgeVol += bridged; bridgeFees += amt; bridgeCount += 1;
    const ts = tsOf(l), d = dayOf(ts);
    const cur = bridgeDay.get(d) || { vol: 0, fees: 0, n: 0 }; cur.vol += bridged; cur.fees += amt; cur.n += 1; bridgeDay.set(d, cur);
    addActor(dayWallets, ts, from);
  }

  // wallets: all-time + windows
  const allActors = new Set();
  const collect = (logs, ti) => logs.forEach((l) => { const a = topicAddr(l, ti); if (a) allActors.add(a); });
  collect(swaps, 1); collect(adds, 1); collect(vaultLogs, 1);
  for (const l of treasuryIn) { const f = topicAddr(l, 1); if (f && f !== POOL.toLowerCase() && f !== "0x0000000000000000000000000000000000000000") allActors.add(f); }
  const nowSec = Math.floor(Date.now() / 1000);
  const inWindow = (sec) => {
    const s = new Set();
    const scan = (logs, ti, isBridge = false) => logs.forEach((l) => { const ts = tsOf(l); if (ts < nowSec - sec) return; const a = topicAddr(l, ti); if (!a) return; if (isBridge && (a === POOL.toLowerCase() || a === "0x0000000000000000000000000000000000000000")) return; s.add(a); });
    scan(swaps, 1); scan(adds, 1); scan(vaultLogs, 1); scan(treasuryIn, 1, true);
    return s.size;
  };

  // TVL + vault pps
  const gb = await ethCall(POOL, SEL.get_balances);
  const poolUsdc = Number(word(gb, 0)) / DEC, poolEurc = Number(word(gb, 1)) / DEC;
  const vaU = Number(BigInt(await ethCall(VAULT_USDC, SEL.totalAssets) || "0x0")) / DEC;
  const vsU = BigInt(await ethCall(VAULT_USDC, SEL.totalSupply) || "0x0");
  const vaE = Number(BigInt(await ethCall(VAULT_EURC, SEL.totalAssets) || "0x0")) / DEC;
  const vsE = BigInt(await ethCall(VAULT_EURC, SEL.totalSupply) || "0x0");
  const ppsU = vsU > 0n ? (vaU * DEC) / Number(vsU) : 1;
  const ppsE = vsE > 0n ? (vaE * DEC) / Number(vsE) : 1;

  const r2 = (n) => Math.round(n * 100) / 100;
  const sortDays = (m, f) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => f(d, v));

  const out = {
    generatedAt: new Date().toISOString(),
    kpis: {
      totalVolume: r2(swapVol + liqVol + vaultVol + bridgeVol),
      swapVolume: r2(swapVol), liquidityVolume: r2(liqVol), vaultVolume: r2(vaultVol), bridgeVolume: r2(bridgeVol),
      usdcToEurc: r2(u2e), eurcToUsdc: r2(e2u),
      totalTvl: r2(poolUsdc + poolEurc + vaU + vaE), poolTvl: r2(poolUsdc + poolEurc), vaultTvl: r2(vaU + vaE),
      poolUsdc: r2(poolUsdc), poolEurc: r2(poolEurc),
      swapCount: swaps.length, liquidityCount: adds.length, vaultTxCount: vaultLogs.length, bridgeCount,
      totalTx: swaps.length + adds.length + vaultLogs.length + bridgeCount,
      allTimeWallets: allActors.size, dau: inWindow(86400), wau: inWindow(604800), mau: inWindow(2592000),
      bridgeFees: r2(bridgeFees), swapAdminFees: r2(swapAdminFees), treasuryRevenue: r2(treasuryRevenue),
      treasury: TREASURY,
    },
    dailyVolume: sortDays(dayVol, (d, v) => ({ day: d, volume: r2(v.vol), swaps: v.swaps })),
    dailyWallets: sortDays(dayWallets, (d, set) => ({ day: d, wallets: set.size })),
    dailyBridge: sortDays(bridgeDay, (d, v) => ({ day: d, volume: r2(v.vol), fees: r2(v.fees), bridges: v.n })),
    volumeBySource: [
      { source: "Swaps", volume: r2(swapVol) },
      { source: "Pool", volume: r2(liqVol) },
      { source: "Vaults", volume: r2(vaultVol) },
      { source: "Bridge", volume: r2(bridgeVol) },
    ],
    directional: [
      { direction: "USDC to EURC", volume: r2(u2e) },
      { direction: "EURC to USDC", volume: r2(e2u) },
    ],
    vaults: [
      { vault: "luneUSDC", tvl: r2(vaU), pps: Math.round(ppsU * 1e8) / 1e8, yieldPct: Math.round((ppsU - 1) * 1e6) / 1e4 },
      { vault: "luneEURC", tvl: r2(vaE), pps: Math.round(ppsE * 1e8) / 1e8, yieldPct: Math.round((ppsE - 1) * 1e6) / 1e4 },
    ],
  };

  const dir = join(dirname(fileURLToPath(import.meta.url)), "dune-export");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "aggregates.json"), JSON.stringify(out, null, 2));
  console.log("Wrote aggregates.json");
  console.log("  total volume", out.kpis.totalVolume, "| TVL", out.kpis.totalTvl, "| wallets", out.kpis.allTimeWallets);
  console.log("  daily points:", out.dailyVolume.length, "vol /", out.dailyWallets.length, "wallets /", out.dailyBridge.length, "bridge");
  console.log("  DAU/WAU/MAU:", out.kpis.dau, out.kpis.wau, out.kpis.mau);
}
main().catch((e) => { console.error(e); process.exit(1); });
