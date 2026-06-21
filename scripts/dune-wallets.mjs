#!/usr/bin/env node
/**
 * Computes per-wallet Lunex aggregates from Arc on-chain events and emits a
 * parameterized DuneSQL query (inlined VALUES + a {{wallet}} text parameter) so
 * the Dune dashboard can look up any wallet. Writes scripts/dune-export/wallet-lookup.sql.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const EXPLORER = "https://testnet.arcscan.app";
const POOL = "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8";
const VAULT_USDC = "0x66CF9CA9D75FD62438C6E254bA35E61775EF9496";
const VAULT_EURC = "0xcF2C839B12ECf6D9eEcd4607521B73fcFb7E8713";
const USDC = "0x3600000000000000000000000000000000000000";
const TREASURY = "0xc81b2328f7f04dc667428da9a84ce627338873fd";
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
const word = (d, i) => { const h = d.startsWith("0x") ? d.slice(2) : d; const s = h.slice(i * 64, (i + 1) * 64); return s.length < 64 ? 0n : BigInt("0x" + s); };
const addrTopic = (a) => "0x" + "0".repeat(24) + a.toLowerCase().replace(/^0x/, "");
const topicAddr = (l, i) => (l.topics[i] ? "0x" + l.topics[i].slice(26).toLowerCase() : null);
const tsOf = (l) => (l.timeStamp ? parseInt(l.timeStamp, 16) : 0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry a page until it succeeds (or genuinely returns no records); THROW on
// unrecoverable failure so we never ship partial/inaccurate aggregates.
async function fetchPage(url) {
  let lastErr;
  for (let a = 0; a < 6; a++) {
    try {
      const r = await fetch(url);
      const j = await r.json();
      if (Array.isArray(j.result)) return j.result;
      const msg = String(j.message ?? "").toLowerCase();
      if (msg.includes("no records") || msg.includes("not found")) return [];
      lastErr = new Error(j.message || "non-array result");
    } catch (e) { lastErr = e; }
    await sleep(500 * (a + 1));
  }
  throw lastErr instanceof Error ? lastErr : new Error("explorer page failed");
}

async function fetchLogs(address, topic0, extra = "") {
  const out = [], seen = new Set();
  let cursor = DEPLOY_BLOCK;
  for (let p = 0; p < 200; p++) {
    const url = `${EXPLORER}/api?module=logs&action=getLogs&address=${address}&topic0=${topic0}${extra}&fromBlock=${cursor}&toBlock=latest`;
    const rows = await fetchPage(url);
    if (!rows.length) break;
    let max = cursor;
    for (const row of rows) { const k = `${row.transactionHash}:${row.logIndex}`; if (!seen.has(k)) { seen.add(k); out.push(row); } const b = parseInt(row.blockNumber, 16); if (b > max) max = b; }
    if (rows.length < 1000) break; if (max <= cursor) break; cursor = max;
  }
  return out;
}

function ensure(map, w) {
  if (!map.has(w)) map.set(w, { swapVol: 0, swapN: 0, liqVol: 0, liqN: 0, vaultVol: 0, vaultN: 0, bridgeFees: 0, bridgeN: 0, first: Infinity, last: 0 });
  return map.get(w);
}
function touch(rec, ts) { if (ts) { if (ts < rec.first) rec.first = ts; if (ts > rec.last) rec.last = ts; } }

async function main() {
  console.log("Fetching Lunex events…");
  const [swaps, adds, ud, uw, ed, ew, fees] = await Promise.all([
    fetchLogs(POOL, TOPIC.tokenExchange),
    fetchLogs(POOL, TOPIC.addLiquidity),
    fetchLogs(VAULT_USDC, TOPIC.deposit),
    fetchLogs(VAULT_USDC, TOPIC.withdraw),
    fetchLogs(VAULT_EURC, TOPIC.deposit),
    fetchLogs(VAULT_EURC, TOPIC.withdraw),
    fetchLogs(USDC, TOPIC.transfer, `&topic2=${addrTopic(TREASURY)}&topic0_2_opr=and`),
  ]);

  const m = new Map();
  for (const l of swaps) { const w = topicAddr(l, 1); if (!w) continue; const r = ensure(m, w); const s = word(l.data, 0); r.swapVol += Number(s === 0n ? word(l.data, 1) : word(l.data, 3)) / DEC; r.swapN++; touch(r, tsOf(l)); }
  for (const l of adds) { const w = topicAddr(l, 1); if (!w) continue; const r = ensure(m, w); r.liqVol += (Number(word(l.data, 0)) + Number(word(l.data, 1))) / DEC; r.liqN++; touch(r, tsOf(l)); }
  for (const l of [...ud, ...uw, ...ed, ...ew]) { const w = topicAddr(l, 1); if (!w) continue; const r = ensure(m, w); r.vaultVol += Number(word(l.data, 0)) / DEC; r.vaultN++; touch(r, tsOf(l)); }
  for (const l of fees) {
    const from = topicAddr(l, 1);
    if (!from || from === POOL.toLowerCase() || from === "0x0000000000000000000000000000000000000000") continue;
    const r = ensure(m, from); r.bridgeFees += Number(word(l.data, 0)) / DEC; r.bridgeN++; touch(r, tsOf(l));
  }

  const r0 = (n) => Math.round(n);
  const day = (ts) => (ts && ts !== Infinity ? new Date(ts * 1000).toISOString().slice(0, 10) : "1970-01-01");
  // Keep wallets with >= $1 lifetime volume (drops dust) and round volumes to
  // whole dollars to keep the inlined query small enough for the API.
  const rows = [...m.entries()].map(([w, r]) => {
    const bridgeVol = r.bridgeFees / FEE_RATE;
    const total = r.swapVol + r.liqVol + r.vaultVol + bridgeVol;
    const txn = r.swapN + r.liqN + r.vaultN + r.bridgeN;
    return { w, total: r0(total), swapVol: r0(r.swapVol), liqVol: r0(r.liqVol), vaultVol: r0(r.vaultVol), bridgeVol: r0(bridgeVol), bridgeN: r.bridgeN, txn, last: day(r.last) };
  }).filter((r) => r.txn > 0 && r.total >= 1).sort((a, b) => b.total - a.total);

  // Lean 5-col inline so the whole thing fits in a single parameterized query.
  // Cap at the top 1000 wallets by volume (covers every meaningful user; the
  // in-app /analytics search covers the long tail live).
  const dexVol = (r) => r.swapVol + r.liqVol + r.vaultVol;
  const values = rows
    .slice(0, 300)
    .map((r) => `('${r.w}',${r.total},${dexVol(r)},${r.bridgeVol},${r.txn})`)
    .join(",\n  ");

  const sql = `-- Lunex wallet lookup — enter an address in the {{wallet}} parameter
SELECT wallet, total_volume_usd, dex_volume_usd, bridge_volume_usd, transactions
FROM (VALUES
  ${values}
) AS t(wallet, total_volume_usd, dex_volume_usd, bridge_volume_usd, transactions)
WHERE wallet = lower('{{wallet}}')`;

  const dir = join(dirname(fileURLToPath(import.meta.url)), "dune-export");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "wallet-lookup.sql"), sql);

  // Top-200 leaderboard.
  const top = rows.slice(0, 200);
  const topValues = top
    .map((r, i) => `(${i + 1},'${r.w}',${r.total},${r.swapVol + r.liqVol + r.vaultVol},${r.bridgeVol},${r.txn})`)
    .join(",\n  ");
  const leaderboard = `-- Lunex — Top 200 Wallets by lifetime volume
SELECT rank, wallet, total_volume_usd, dex_volume_usd, bridge_volume_usd, transactions
FROM (VALUES
  ${topValues}
) AS t(rank, wallet, total_volume_usd, dex_volume_usd, bridge_volume_usd, transactions)
ORDER BY rank`;
  writeFileSync(join(dir, "wallet-leaderboard.sql"), leaderboard);

  console.log(`Wrote wallet-lookup.sql — ${rows.length} wallets, ${Math.round(sql.length / 1024)} KB`);
  console.log(`Wrote wallet-leaderboard.sql — top 50, ${Math.round(leaderboard.length / 1024)} KB`);
  console.log("Top wallet:", rows[0]?.w, "$" + rows[0]?.total);
}
main().catch((e) => { console.error(e); process.exit(1); });
