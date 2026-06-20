-- =====================================================================
-- Lunex Protocol — Dune dashboard queries
-- =====================================================================
-- Arc Testnet is not natively indexed by Dune, so these queries run against
-- the CSVs produced by `node scripts/dune-export.mjs` and uploaded via
-- Dune → "Upload data". Replace `dune.lunexfinance` below with YOUR upload
-- namespace (Dune shows it as `dune.<your_handle>.dataset_<name>` after upload).
--
-- Tables expected:
--   dataset_lunex_swaps        (ts, date, tx_hash, usdc_volume, direction, wallet)
--   dataset_lunex_liquidity    (ts, date, tx_hash, amount_usd, wallet)
--   dataset_lunex_vault_txs    (ts, date, tx_hash, vault, kind, assets_usd, wallet)
--   dataset_lunex_bridge_fees  (ts, date, tx_hash, fee_usd, bridged_usd, wallet)
--   dataset_lunex_tvl_snapshot (captured_at, pool_usdc, pool_eurc, vault_usdc_assets, vault_eurc_assets, pps_usdc, pps_eurc, total_tvl_usd)
--   dataset_lunex_summary      (metric, value)
-- =====================================================================

-- 1) Headline KPIs (counter widgets) — pull any metric from the summary table
--    e.g. total_tvl_usd, total_volume_usd, all_time_wallets, bridge_volume_usd
SELECT value
FROM dune.lunexfinance.dataset_lunex_summary
WHERE metric = 'total_volume_usd';

-- 2) Total Protocol Volume = swaps + pool + vaults + bridge (single counter)
SELECT
  (SELECT SUM(CAST(usdc_volume AS double)) FROM dune.lunexfinance.dataset_lunex_swaps)
  + (SELECT SUM(CAST(amount_usd AS double)) FROM dune.lunexfinance.dataset_lunex_liquidity)
  + (SELECT SUM(CAST(assets_usd AS double)) FROM dune.lunexfinance.dataset_lunex_vault_txs)
  + (SELECT SUM(CAST(bridged_usd AS double)) FROM dune.lunexfinance.dataset_lunex_bridge_fees)
  AS total_protocol_volume_usd;

-- 3) Volume by source (bar chart)
SELECT 'Swaps'  AS source, SUM(CAST(usdc_volume AS double)) AS volume_usd FROM dune.lunexfinance.dataset_lunex_swaps
UNION ALL SELECT 'Pool',    SUM(CAST(amount_usd AS double))  FROM dune.lunexfinance.dataset_lunex_liquidity
UNION ALL SELECT 'Vaults',  SUM(CAST(assets_usd AS double))  FROM dune.lunexfinance.dataset_lunex_vault_txs
UNION ALL SELECT 'Bridge',  SUM(CAST(bridged_usd AS double)) FROM dune.lunexfinance.dataset_lunex_bridge_fees;

-- 4) Daily swap volume (area/bar time series)
SELECT date,
       SUM(CAST(usdc_volume AS double)) AS swap_volume_usd,
       COUNT(*) AS swaps
FROM dune.lunexfinance.dataset_lunex_swaps
GROUP BY date
ORDER BY date;

-- 5) USDC <-> EURC directional swap volume (pie / bar)
SELECT direction, SUM(CAST(usdc_volume AS double)) AS volume_usd, COUNT(*) AS swaps
FROM dune.lunexfinance.dataset_lunex_swaps
GROUP BY direction;

-- 6) Daily Active Wallets (bar) — unique wallets per day across all activity
WITH activity AS (
  SELECT date, wallet FROM dune.lunexfinance.dataset_lunex_swaps
  UNION ALL SELECT date, wallet FROM dune.lunexfinance.dataset_lunex_liquidity
  UNION ALL SELECT date, wallet FROM dune.lunexfinance.dataset_lunex_vault_txs
  UNION ALL SELECT date, wallet FROM dune.lunexfinance.dataset_lunex_bridge_fees
)
SELECT date, COUNT(DISTINCT wallet) AS active_wallets
FROM activity
WHERE wallet IS NOT NULL
GROUP BY date
ORDER BY date;

-- 7) Active wallets — DAU / WAU / MAU / all-time (counters)
WITH activity AS (
  SELECT ts, wallet FROM dune.lunexfinance.dataset_lunex_swaps
  UNION ALL SELECT ts, wallet FROM dune.lunexfinance.dataset_lunex_liquidity
  UNION ALL SELECT ts, wallet FROM dune.lunexfinance.dataset_lunex_vault_txs
  UNION ALL SELECT ts, wallet FROM dune.lunexfinance.dataset_lunex_bridge_fees
)
SELECT
  COUNT(DISTINCT CASE WHEN ts >= to_unixtime(now()) - 86400  THEN wallet END) AS dau,
  COUNT(DISTINCT CASE WHEN ts >= to_unixtime(now()) - 604800 THEN wallet END) AS wau,
  COUNT(DISTINCT CASE WHEN ts >= to_unixtime(now()) - 2592000 THEN wallet END) AS mau,
  COUNT(DISTINCT wallet) AS all_time
FROM activity
WHERE wallet IS NOT NULL;

-- 8) TVL breakdown (counters) — latest snapshot
SELECT
  CAST(pool_usdc AS double) + CAST(pool_eurc AS double) AS pool_tvl_usd,
  CAST(vault_usdc_assets AS double) + CAST(vault_eurc_assets AS double) AS vault_tvl_usd,
  CAST(total_tvl_usd AS double) AS total_tvl_usd
FROM dune.lunexfinance.dataset_lunex_tvl_snapshot
ORDER BY captured_at DESC
LIMIT 1;

-- 9) Vault performance / auto-compounding (table)
SELECT
  'luneUSDC' AS vault, CAST(vault_usdc_assets AS double) AS tvl_usd, CAST(pps_usdc AS double) AS price_per_share,
  (CAST(pps_usdc AS double) - 1) * 100 AS yield_pct
FROM dune.lunexfinance.dataset_lunex_tvl_snapshot ORDER BY captured_at DESC LIMIT 1
UNION ALL
SELECT
  'luneEURC', CAST(vault_eurc_assets AS double), CAST(pps_eurc AS double),
  (CAST(pps_eurc AS double) - 1) * 100
FROM dune.lunexfinance.dataset_lunex_tvl_snapshot ORDER BY captured_at DESC LIMIT 1;

-- 10) Bridge (CCTP) + treasury revenue
SELECT
  SUM(CAST(bridged_usd AS double)) AS lunex_bridge_volume_usd,
  SUM(CAST(fee_usd AS double))     AS bridge_fees_usd,
  COUNT(*)                         AS bridges
FROM dune.lunexfinance.dataset_lunex_bridge_fees;

-- 11) Daily bridge volume (time series)
SELECT date,
       SUM(CAST(bridged_usd AS double)) AS bridge_volume_usd,
       SUM(CAST(fee_usd AS double))     AS fees_usd,
       COUNT(*) AS bridges
FROM dune.lunexfinance.dataset_lunex_bridge_fees
GROUP BY date
ORDER BY date;

-- 12) Pool APR (counter) — trailing-30d swap fees (0.04%) annualised over pool TVL
WITH vol AS (
  SELECT SUM(CAST(usdc_volume AS double)) AS v30
  FROM dune.lunexfinance.dataset_lunex_swaps
  WHERE ts >= to_unixtime(now()) - 2592000
), tvl AS (
  SELECT CAST(pool_usdc AS double) + CAST(pool_eurc AS double) AS pool_tvl
  FROM dune.lunexfinance.dataset_lunex_tvl_snapshot ORDER BY captured_at DESC LIMIT 1
)
SELECT CASE WHEN tvl.pool_tvl > 0
            THEN (vol.v30 * 0.0004 * (365.0/30.0)) / tvl.pool_tvl * 100
            ELSE 0 END AS pool_apr_pct
FROM vol, tvl;
