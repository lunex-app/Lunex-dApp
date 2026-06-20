#!/usr/bin/env node
/**
 * Lunex → Dune custom-data exporter.
 *
 * Arc Testnet is not natively indexed by Dune, so this script reads Lunex's
 * on-chain activity straight from Arc (the same sources the in-app /analytics
 * page uses) and writes Dune-ready CSVs. Upload them via Dune → "Upload data"
 * (free tier) — or, once the Dune MCP is authenticated, they can be inserted
 * programmatically — then build the dashboard with the queries in dune/queries.sql.
 *
 *   node scripts/dune-export.mjs
 *
 * Output: scripts/dune-export/*.csv
 *
 * Datasets (one CSV each, table names suggested for the Dune upload):
 *   lunex_swaps        — every StableSwap trade (ts, date, usdc_volume, direction, wallet)
 *   lunex_liquidity    — add-liquidity events (ts, date, amount_usd, wallet)
 *   lunex_vault_txs    — vault deposit/withdraw (ts, date, vault, kind, assets_usd, wallet)
 *   lunex_bridge_fees  — Lunex bridge fees to treasury (ts, date, fee_usd, bridged_usd, wallet)
 *   lunex_tvl_snapshot — current pool/vault TVL + price-per-share
 *   lunex_summary      — headline metrics (metric, value)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const EXPLORER = process.env.ARC_EXPLORER_URL || "https://testnet.arcscan.app";
const RPC = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";

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
const FEE_RATE = 0.001; // 0.1% Lunex bridge fee

const word = (data, i) => {
  const h = data.startsWith("0x") ? data.slice(2) : data;
  const s = h.slice(i * 64, (i + 1) * 64);
  return s.length < 64 ? 0n : BigInt("0x" + s);
};
const addrTopic = (a) => "0x" + "0".repeat(24) + a.toLowerCase().replace(/^0x/, "");
const topicAddr = (log, i) => (log.topics[i] ? "0x" + log.topics[i].slice(26).toLowerCase() : null);
const tsOf = (log) => (log.timeStamp ? parseInt(log.timeStamp, 16) : 0);
const dayOf = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

async function fetchLogs(address, topic0, extra = "") {
  const out = [];
  const seen = new Set();
  let cursor = DEPLOY_BLOCK;
  for (let page = 0; page < 200; page++) {
    const url = `${EXPLORER}/api?module=logs&action=getLogs&address=${address}&topic0=${topic0}${extra}&fromBlock=${cursor}&toBlock=latest`;
    let rows = [];
    try {
      const r = await fetch(url);
      const j = await r.json();
      if (!Array.isArray(j.result)) break;
      rows = j.result;
    } catch {
      break;
    }
    if (!rows.length) break;
    let max = cursor;
    for (const row of rows) {
      const k = `${row.transactionHash}:${row.logIndex}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(row);
      }
      const b = parseInt(row.blockNumber, 16);
      if (b > max) max = b;
    }
    if (rows.length < 1000) break;
    if (max <= cursor) break;
    cursor = max;
    process.stdout.write(`\r  ${address.slice(0, 8)}… ${out.length} logs`);
  }
  process.stdout.write("\n");
  return out;
}

async function ethCall(to, selectorHex) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data: selectorHex }, "latest"] }),
  });
  const j = await r.json();
  return j.result || "0x";
}

// 4-byte selectors (keccak of the signature) for the view calls we need.
const SEL = {
  get_balances: "0x14f05979", // get_balances()
  fee: "0xddca3f43", // fee()
  totalAssets: "0x01e1d114", // totalAssets()
  totalSupply: "0x18160ddd", // totalSupply()
};

function csv(rows, header) {
  const esc = (v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.join(","), ...rows.map((r) => header.map((h) => esc(r[h])).join(","))].join("\n") + "\n";
}

async function main() {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), "dune-export");
  mkdirSync(outDir, { recursive: true });
  console.log("Reading Lunex on-chain activity from Arc…");

  const [swaps, adds, uDep, uWd, eDep, eWd, treasuryIn] = await Promise.all([
    fetchLogs(POOL, TOPIC.tokenExchange),
    fetchLogs(POOL, TOPIC.addLiquidity),
    fetchLogs(VAULT_USDC, TOPIC.deposit),
    fetchLogs(VAULT_USDC, TOPIC.withdraw),
    fetchLogs(VAULT_EURC, TOPIC.deposit),
    fetchLogs(VAULT_EURC, TOPIC.withdraw),
    fetchLogs(USDC, TOPIC.transfer, `&topic2=${addrTopic(TREASURY)}&topic0_2_opr=and`),
  ]);

  // ---- swaps ----
  const swapRows = swaps.map((l) => {
    const soldId = word(l.data, 0);
    const usdcLeg = soldId === 0n ? word(l.data, 1) : word(l.data, 3);
    const ts = tsOf(l);
    return {
      ts,
      date: dayOf(ts),
      tx_hash: l.transactionHash,
      usdc_volume: (Number(usdcLeg) / DEC).toFixed(6),
      direction: soldId === 0n ? "usdc_to_eurc" : "eurc_to_usdc",
      wallet: topicAddr(l, 1),
    };
  });

  // ---- liquidity ----
  const liqRows = adds.map((l) => {
    const ts = tsOf(l);
    return {
      ts,
      date: dayOf(ts),
      tx_hash: l.transactionHash,
      amount_usd: ((Number(word(l.data, 0)) + Number(word(l.data, 1))) / DEC).toFixed(6),
      wallet: topicAddr(l, 1),
    };
  });

  // ---- vault txs ----
  const vaultRows = [
    ...uDep.map((l) => ({ l, vault: "luneUSDC", kind: "deposit" })),
    ...uWd.map((l) => ({ l, vault: "luneUSDC", kind: "withdraw" })),
    ...eDep.map((l) => ({ l, vault: "luneEURC", kind: "deposit" })),
    ...eWd.map((l) => ({ l, vault: "luneEURC", kind: "withdraw" })),
  ].map(({ l, vault, kind }) => {
    const ts = tsOf(l);
    return {
      ts,
      date: dayOf(ts),
      tx_hash: l.transactionHash,
      vault,
      kind,
      assets_usd: (Number(word(l.data, 0)) / DEC).toFixed(6),
      wallet: topicAddr(l, 1),
    };
  });

  // ---- bridge fees (classified: pool = swap admin fee, EOA = bridge fee) ----
  const bridgeRows = [];
  let swapAdminFees = 0;
  let treasuryRevenue = 0;
  for (const l of treasuryIn) {
    const amount = Number(word(l.data, 0)) / DEC;
    treasuryRevenue += amount;
    const from = topicAddr(l, 1);
    if (from === POOL.toLowerCase()) {
      swapAdminFees += amount;
    } else if (from === "0x0000000000000000000000000000000000000000") {
      /* mint */
    } else {
      const ts = tsOf(l);
      bridgeRows.push({
        ts,
        date: dayOf(ts),
        tx_hash: l.transactionHash,
        fee_usd: amount.toFixed(6),
        bridged_usd: (amount / FEE_RATE).toFixed(6),
        wallet: from,
      });
    }
  }

  // ---- TVL snapshot (RPC) ----
  const gb = await ethCall(POOL, SEL.get_balances);
  const poolUsdc = Number(word(gb, 0)) / DEC;
  const poolEurc = Number(word(gb, 1)) / DEC;
  const vaUsdc = Number(BigInt(await ethCall(VAULT_USDC, SEL.totalAssets) || "0x0")) / DEC;
  const vsUsdc = BigInt(await ethCall(VAULT_USDC, SEL.totalSupply) || "0x0");
  const vaEurc = Number(BigInt(await ethCall(VAULT_EURC, SEL.totalAssets) || "0x0")) / DEC;
  const vsEurc = BigInt(await ethCall(VAULT_EURC, SEL.totalSupply) || "0x0");
  const ppsUsdc = vsUsdc > 0n ? (vaUsdc * DEC) / Number(vsUsdc) : 1;
  const ppsEurc = vsEurc > 0n ? (vaEurc * DEC) / Number(vsEurc) : 1;

  const sum = (rows, k) => rows.reduce((s, r) => s + Number(r[k]), 0);
  const swapVol = sum(swapRows, "usdc_volume");
  const liqVol = sum(liqRows, "amount_usd");
  const vaultVol = sum(vaultRows, "assets_usd");
  const bridgeVol = sum(bridgeRows, "bridged_usd");
  const bridgeFees = sum(bridgeRows, "fee_usd");
  const uniq = (rows) => new Set(rows.map((r) => r.wallet).filter(Boolean));
  const allWallets = new Set([
    ...uniq(swapRows),
    ...uniq(liqRows),
    ...uniq(vaultRows),
    ...uniq(bridgeRows),
  ]);
  const poolTvl = poolUsdc + poolEurc;
  const vaultTvl = vaUsdc + vaEurc;

  const summary = [
    ["total_tvl_usd", (poolTvl + vaultTvl).toFixed(2)],
    ["pool_tvl_usd", poolTvl.toFixed(2)],
    ["vault_tvl_usd", vaultTvl.toFixed(2)],
    ["total_volume_usd", (swapVol + liqVol + vaultVol + bridgeVol).toFixed(2)],
    ["swap_volume_usd", swapVol.toFixed(2)],
    ["liquidity_volume_usd", liqVol.toFixed(2)],
    ["vault_volume_usd", vaultVol.toFixed(2)],
    ["bridge_volume_usd", bridgeVol.toFixed(2)],
    ["usdc_to_eurc_usd", sum(swapRows.filter((r) => r.direction === "usdc_to_eurc"), "usdc_volume").toFixed(2)],
    ["eurc_to_usdc_usd", sum(swapRows.filter((r) => r.direction === "eurc_to_usdc"), "usdc_volume").toFixed(2)],
    ["swap_count", swapRows.length],
    ["bridge_count", bridgeRows.length],
    ["all_time_wallets", allWallets.size],
    ["bridge_fees_usd", bridgeFees.toFixed(2)],
    ["swap_admin_fees_usd", swapAdminFees.toFixed(2)],
    ["treasury_revenue_usd", treasuryRevenue.toFixed(2)],
    ["generated_at", new Date().toISOString()],
  ].map(([metric, value]) => ({ metric, value }));

  const tvlSnapshot = [
    {
      captured_at: new Date().toISOString(),
      pool_usdc: poolUsdc.toFixed(6),
      pool_eurc: poolEurc.toFixed(6),
      vault_usdc_assets: vaUsdc.toFixed(6),
      vault_eurc_assets: vaEurc.toFixed(6),
      pps_usdc: ppsUsdc.toFixed(8),
      pps_eurc: ppsEurc.toFixed(8),
      total_tvl_usd: (poolTvl + vaultTvl).toFixed(2),
    },
  ];

  const files = {
    "lunex_swaps.csv": csv(swapRows, ["ts", "date", "tx_hash", "usdc_volume", "direction", "wallet"]),
    "lunex_liquidity.csv": csv(liqRows, ["ts", "date", "tx_hash", "amount_usd", "wallet"]),
    "lunex_vault_txs.csv": csv(vaultRows, ["ts", "date", "tx_hash", "vault", "kind", "assets_usd", "wallet"]),
    "lunex_bridge_fees.csv": csv(bridgeRows, ["ts", "date", "tx_hash", "fee_usd", "bridged_usd", "wallet"]),
    "lunex_tvl_snapshot.csv": csv(tvlSnapshot, [
      "captured_at", "pool_usdc", "pool_eurc", "vault_usdc_assets", "vault_eurc_assets", "pps_usdc", "pps_eurc", "total_tvl_usd",
    ]),
    "lunex_summary.csv": csv(summary, ["metric", "value"]),
  };
  for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), content);

  console.log(`\nWrote ${Object.keys(files).length} CSVs to ${outDir}`);
  console.log("Headline:");
  for (const r of summary) console.log(`  ${r.metric.padEnd(22)} ${r.value}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
