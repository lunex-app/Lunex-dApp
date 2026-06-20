#!/usr/bin/env node
/**
 * Reads scripts/dune-export/aggregates.json and emits self-contained DuneSQL
 * (data inlined as VALUES) for each dashboard panel → scripts/dune-export/dune-queries.json
 * as { name: sql }. Arc isn't on Dune, so inlining is how the Dune dashboard
 * shows real Lunex numbers without a custom-data upload.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "dune-export");
const a = JSON.parse(readFileSync(join(dir, "aggregates.json"), "utf8"));
const k = a.kpis;

const rowsVolume = a.dailyVolume.map((r) => `(DATE '${r.day}', ${r.volume}, ${r.swaps})`).join(",\n  ");
const rowsWallets = a.dailyWallets.map((r) => `(DATE '${r.day}', ${r.wallets})`).join(",\n  ");
const rowsBridge = a.dailyBridge.map((r) => `(DATE '${r.day}', ${r.volume}, ${r.fees}, ${r.bridges})`).join(",\n  ");
const rowsSource = a.volumeBySource.map((r) => `('${r.source}', ${r.volume})`).join(",\n  ");
const rowsDir = a.directional.map((r) => `('${r.direction}', ${r.volume})`).join(",\n  ");
const rowsVaults = a.vaults.map((r) => `('${r.vault}', ${r.tvl}, ${r.pps}, ${r.yieldPct})`).join(",\n  ");

const queries = {
  kpis: `-- Lunex headline KPIs (counters)
SELECT
  ${k.totalVolume} AS total_volume_usd,
  ${k.totalTvl} AS total_value_locked_usd,
  ${k.allTimeWallets} AS all_time_wallets,
  ${k.totalTx} AS total_transactions,
  ${k.bridgeVolume} AS bridge_volume_usd,
  ${k.swapVolume} AS swap_volume_usd`,

  daily_volume: `-- Daily swap volume (last ${a.dailyVolume.length} active days)
SELECT day, volume AS swap_volume_usd, swaps
FROM (VALUES
  ${rowsVolume}
) AS t(day, volume, swaps)
ORDER BY day`,

  volume_by_source: `-- Protocol volume by source
SELECT source, volume AS volume_usd
FROM (VALUES
  ${rowsSource}
) AS t(source, volume)`,

  directional: `-- USDC <-> EURC swap volume
SELECT direction, volume AS volume_usd
FROM (VALUES
  ${rowsDir}
) AS t(direction, volume)`,

  daily_wallets: `-- Daily active wallets
SELECT day, wallets AS active_wallets
FROM (VALUES
  ${rowsWallets}
) AS t(day, wallets)
ORDER BY day`,

  wallet_windows: `-- Active wallets: daily / weekly / monthly / all-time
SELECT
  ${k.dau} AS daily_active,
  ${k.wau} AS weekly_active,
  ${k.mau} AS monthly_active,
  ${k.allTimeWallets} AS all_time_wallets`,

  vaults: `-- Vault performance (ERC-4626 auto-compounding)
SELECT vault, tvl AS tvl_usd, pps AS price_per_share, yield_pct
FROM (VALUES
  ${rowsVaults}
) AS t(vault, tvl, pps, yield_pct)`,

  tvl: `-- Total Value Locked breakdown
SELECT
  ${k.poolTvl} AS pool_tvl_usd,
  ${k.poolUsdc} AS pool_usdc,
  ${k.poolEurc} AS pool_eurc,
  ${k.vaultTvl} AS vault_tvl_usd,
  ${k.totalTvl} AS total_tvl_usd`,

  bridge_summary: `-- Bridge (CCTP) volume + treasury revenue
SELECT
  ${k.bridgeVolume} AS lunex_bridge_volume_usd,
  ${k.bridgeFees} AS bridge_fees_usd,
  ${k.bridgeCount} AS bridges_settled,
  ${k.swapAdminFees} AS swap_admin_fees_usd,
  ${k.treasuryRevenue} AS total_treasury_revenue_usd`,

  daily_bridge: `-- Daily bridge volume (Lunex CCTP, fee-derived)
SELECT day, volume AS bridge_volume_usd, fees AS fees_usd, bridges
FROM (VALUES
  ${rowsBridge}
) AS t(day, volume, fees, bridges)
ORDER BY day`,
};

writeFileSync(join(dir, "dune-queries.json"), JSON.stringify(queries, null, 2));
console.log("Wrote dune-queries.json with", Object.keys(queries).length, "queries");
