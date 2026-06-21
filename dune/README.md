# Lunex — Dune Analytics Dashboard

**Live dashboard:** https://dune.com/lunexfinance1264/lunex-protocol-arc-analytics

### Wallet analytics on Dune
- **Top Wallets** (live, on the dashboard) — top 50 wallets by lifetime volume.
  Refresh with `node scripts/dune-wallets.mjs` → re-run the `Lunex — Top Wallets`
  query (query 7770453) with the new VALUES.
- **Wallet Lookup** (query 7770522, parameterized `{{wallet}}`) — looks up ANY
  wallet's Lunex activity. It reads the uploaded per-event tables, so first run
  `node scripts/dune-export.mjs` and upload `lunex_swaps.csv`, `lunex_liquidity.csv`,
  `lunex_vault_txs.csv`, `lunex_bridge_fees.csv` via Dune → **Upload data** (free),
  naming them `lunex_swaps` etc. Then the query resolves and can be added to the
  dashboard as a parameterized panel. (The in-app `/analytics` wallet search
  already does any-wallet lookup live, no upload needed.)


Built via the Dune MCP with Lunex's on-chain numbers inlined as SQL `VALUES`
(Arc isn't natively on Dune). It's a point-in-time snapshot; to refresh, re-run
`node scripts/dune-build-data.mjs` and update the query `VALUES`. The
upload-CSV path below is an alternative for a self-refreshing dataset.

---


Arc Testnet isn't natively indexed by Dune, so this folder uses Dune's
**custom data** feature: export Lunex's on-chain activity to CSVs, upload them,
then build the dashboard from `queries.sql`. The numbers match the in-app
`/analytics` page exactly (same on-chain sources).

## 1. Export the data

```bash
node scripts/dune-export.mjs
```

Writes 6 CSVs to `scripts/dune-export/`:

| CSV | Table to create | Contents |
|-----|-----------------|----------|
| `lunex_swaps.csv` | `lunex_swaps` | every StableSwap trade (date, usdc_volume, direction, wallet) |
| `lunex_liquidity.csv` | `lunex_liquidity` | add-liquidity events |
| `lunex_vault_txs.csv` | `lunex_vault_txs` | vault deposit/withdraw |
| `lunex_bridge_fees.csv` | `lunex_bridge_fees` | Lunex bridge fees → treasury (fee + implied bridged amount) |
| `lunex_tvl_snapshot.csv` | `lunex_tvl_snapshot` | current pool/vault TVL + price-per-share |
| `lunex_summary.csv` | `lunex_summary` | headline metrics (metric, value) |

Re-run anytime to refresh; re-upload to update the dashboard.

## 2. Upload to Dune (free tier)

For each CSV: Dune → **Upload data** → choose the file → name the table
(e.g. `lunex_swaps`). Dune creates `dune.<your_handle>.dataset_lunex_swaps`.

> Or, once the **Dune MCP** is authenticated (`/mcp` → `dune` → log in), the
> tables + queries + dashboard can be created programmatically — just ask.

## 3. Build the dashboard

Open `queries.sql`, replace `dune.lunexfinance` with your upload namespace, and
create one Dune query per block. Suggested dashboard layout (mirrors the in-app
analytics):

- **Row 1 — counters:** Total Protocol Volume (Q2), Total Value Locked (Q8),
  All-Time Wallets (Q7), Bridge Volume (Q10)
- **Row 2 — wallets:** DAU/WAU/MAU/all-time counters (Q7) + Daily Active Wallets
  bar chart (Q6)
- **Row 3 — volume:** Daily Swap Volume area chart (Q4), Volume by Source bar (Q3),
  USDC↔EURC split (Q5)
- **Row 4 — TVL & vaults:** TVL breakdown (Q8), Vault performance table (Q9),
  Pool APR (Q12)
- **Row 5 — bridge:** Bridge + treasury revenue (Q10), Daily bridge volume (Q11)

## Notes

- **Bridge volume** is Lunex-specific: each Lunex bridge pays a 0.1% USDC fee to
  the treasury in its own tx, so `bridged_usd = fee / 0.001`. Swap admin fees
  (from the pool) are classified separately and excluded from bridge volume.
- Treasury wallet: `0xC81b2328f7f04DC667428DA9a84CE627338873fd`.
- `lunex_summary` holds precomputed headline values if you prefer simple counters
  over the SQL aggregations.
