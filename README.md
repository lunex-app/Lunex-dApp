<div align="center">

# Lunex Finance

### The stablecoin liquidity hub for the dollar-and-euro economy, built natively on Arc

**Zero-slippage USDC/EURC StableSwap · Native CCTP cross-chain routing · Auto-compounding ERC-4626 yield vaults · Passwordless Circle wallets**

[![Network](https://img.shields.io/badge/Network-Arc%20Testnet-19E0E6?style=flat-square)](https://testnet.arcscan.app)
[![Powered by](https://img.shields.io/badge/Powered%20by-Circle%20USDC%20%26%20EURC-2775CA?style=flat-square)](https://www.circle.com)
[![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite%20%2B%20TS-61DAFB?style=flat-square)](https://vitejs.dev)
[![Onchain](https://img.shields.io/badge/Onchain-wagmi%20%2B%20viem-1C1C1C?style=flat-square)](https://wagmi.sh)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](#-license)

[**Live App**](https://lunex.finance) · [**Analytics**](https://lunex.finance/analytics) · [**Dune Dashboard**](https://dune.com/lunexfinance1264/lunex-protocol-arc-analytics) · [**Docs**](https://lunex.finance/docs) · [**X / Twitter**](https://x.com/lunexfinance)

</div>

---

## Table of Contents

- [Overview](#-overview)
- [Why Arc](#-why-arc)
- [Features](#-features)
- [Circle Integrations](#-circle-integrations)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Smart Contracts](#-smart-contracts)
- [Supported Networks](#-supported-networks)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Backend Service](#-backend-service)
- [Analytics & Indexing](#-analytics--indexing)
- [MCP Server (Agent Interface)](#-mcp-server-agent-interface)
- [Deployment](#-deployment)
- [Security](#-security)
- [Roadmap](#-roadmap)
- [License](#-license)

---

## 🌐 Overview

**Lunex Finance** is a stablecoin liquidity protocol deployed natively on the **Arc Network** — Circle's purpose-built Layer-1 for payments and capital markets, where gas is paid in USDC and blocks finalize in under a second.

Lunex unifies the three primitives a stablecoin user needs into one frictionless experience:

1. **Swap** stablecoins at near-zero slippage through a Curve-style StableSwap AMM tuned for the USDC/EURC peg.
2. **Move** real USDC across six chains with Circle's **Cross-Chain Transfer Protocol (CCTP v2)** — native burn-and-mint, no wrapped-asset risk — and via **Circle Gateway** for unified, instant cross-chain balances.
3. **Earn** auto-compounding yield through ERC-4626 tokenized vaults that reinvest accrued swap fees.

The entire protocol is wrapped in a **passwordless onboarding layer** built on Circle Programmable Wallets — users sign in with a **passkey** or **email + PIN** and transact **gaslessly**, with no seed phrases.

Every metric the protocol reports is **decoded directly from on-chain events** and published to a public analytics surface — both in-app and on a custom Dune dashboard.

---

## ⚡ Why Arc

Lunex chose Arc as its native home because it removes the structural barriers that previously made high-frequency stablecoin DeFi unprofitable:

| Property | Benefit to Lunex |
| --- | --- |
| **USDC-denominated gas** | Predictable, dollar-priced transaction costs — no native-token volatility |
| **Sub-second finality** | High-frequency StableSwap routing and agent automation become viable |
| **EVM compatibility** | Battle-tested tooling (Solidity, viem, wagmi) with L1-grade execution |
| **Circle-native** | First-class access to CCTP, Gateway, Wallets, and the broader Circle stack |

---

## ✨ Features

### 💱 StableSwap AMM (`/swap`)
A Curve-style invariant AMM combining constant-product and constant-sum curves with a high amplification coefficient, keeping the curve flat near the 1:1 peg. Trades between USDC and EURC settle with **near-zero price impact**. Live on-chain quoting (`get_dy`), configurable slippage tolerance, and atomic execution that reverts below the user's minimum-received threshold.

### 💧 Liquidity Provision (`/pool`)
Provide USDC/EURC liquidity to earn a share of every swap fee. Add or remove liquidity (balanced or single-sided), track your LP position and pool share in real time, and view live reserves and TVL. LP positions are represented by a standard LP token.

### 🌱 Yield Vaults (`/yield`)
ERC-4626 tokenized vaults (`luneUSDC`, `luneEURC`) give one-click access to auto-compounding strategies. Vaults reinvest accrued swap fees back into the underlying position, compounding yield for passive depositors. Because they follow the ERC-4626 standard, vault shares are composable across DeFi. Per-vault detail pages (`/yield/:token`) expose TVL, price-per-share, and accrued yield.

### 🌉 Cross-Chain Bridge — CCTP v2 (`/bridge` → Transfer)
Native USDC bridging across six chains using Circle's **Cross-Chain Transfer Protocol**: USDC is **burned** on the source chain and **natively minted** on the destination after Circle's attestation — zero slippage, no wrapped/synthetic risk. Includes Fast and Standard transfer paths, a live progress tracker, full **on-chain bridge history** (decoded from `MessageSent` / `DepositForBurn` events), and a **Recovery** flow that resumes any interrupted transfer from its tx hash across all supported chains.

### 🛰️ Circle Gateway (`/bridge` → Gateway)
A **unified USDC balance** across chains via Circle's `unified-balance-kit`. Deposit USDC into the Gateway Wallet, then spend it on any supported chain — **instant** mints via Circle's Forwarding Service (sub-second) or manual mint. Confirmed and pending balances are surfaced separately so deposits are visible while finalizing.

### 🔐 Passwordless Wallets
- **Modular Wallets (passkey):** ERC-4337 smart-account login secured by a device passkey, with **gasless** transactions sponsored by Circle Gas Station.
- **User-Controlled Wallets (email + PIN):** Web2-style onboarding — email OTP plus a 6-digit PIN that signs transactions. The PIN ceremony adapts to the app's light/dark theme.
- **External wallets (RainbowKit):** Injected or WalletConnect EOAs for the multi-chain bridge and Gateway flows.

### 📊 Dashboards & Analytics
- **Portfolio Dashboard (`/dashboard`):** Consolidated view of wallet balances, LP positions, vault holdings, net worth, and per-section transaction history — all read **live on-chain**.
- **Public Analytics (`/analytics`):** TVL, total/swap/pool/vault/bridge volume, USDC↔EURC split, 30-day volume chart, DAU/WAU/MAU + all-time wallets, vault performance, treasury fees, and a **wallet-lookup** search — all decoded from on-chain events, no off-chain database.
- **Protocol Stats (`/stats`):** Headline KPIs and pool APR.

### 📚 Documentation & SDK (`/docs`, `/lunexsdk`)
In-app developer documentation plus a RESTful **DEX Adapter SDK** (`/dex-quote`, `/dex-swap`, `/dex-liquidity`, `/dex-price`) and an **MCP server** that lets AI agents discover pools, read balances, and encode swap intents.

---

## 🔵 Circle Integrations

Lunex is built end-to-end on the Circle developer stack.

| Circle Product | Status | How Lunex uses it |
| --- | :---: | --- |
| **USDC & EURC** | ✅ Live | The two assets the entire protocol is built around |
| **Arc (L1)** | ✅ Live | Native deployment; gas paid in USDC |
| **Modular Wallets** | ✅ Live | Passkey smart-account login (`@circle-fin/modular-wallets-core`) |
| **Gas Station** | ✅ Live | Sponsors gas for passkey user-operations → gasless txns |
| **User-Controlled Wallets** | ✅ Live | Email + PIN embedded wallets (`@circle-fin/w3s-pw-web-sdk`) |
| **Developer-Controlled Wallets** | ✅ Live | Server-side treasury / automation wallet |
| **CCTP v2** | ✅ Live | Native burn-and-mint USDC bridge across 6 chains |
| **Gateway** | ✅ Live | Unified balance + instant transfer (`@circle-fin/unified-balance-kit`, `adapter-viem-v2`) |
| **App Kit** | ✅ Live | Cross-chain SDK surface (`@circle-fin/app-kit`) |
| **StableFX** | 🔭 Planned | Arc-native FX engine for USDC↔EURC pricing/peg |
| **x402 / Gateway Nanopayments** | 🔭 Planned | Sub-cent USDC payments for the SDK and AI-agent automation |
| **CCTP v2 Hooks** | 🔭 Planned | Bridge → auto-deposit into a vault/LP in one transaction |
| **Paymaster** | 🔭 Planned | Pay gas in USDC on non-Arc chains |
| **Smart Contract Platform** | 🔭 Planned | Templated pool/vault deploys + event monitoring |
| **Circle Mint / CPN / Compliance Engine** | 🔭 Planned | Institutional mint/redeem, payout corridors, screening for mainnet |

---

## 🏗️ Architecture

```
                          ┌──────────────────────────────────────────────┐
                          │                 Lunex Frontend               │
                          │      React + Vite + TypeScript + Tailwind    │
                          │                                              │
   Passkey / Email / WC ─▶│  WalletProvider ─ wagmi / viem ─ RainbowKit  │
                          │        │                                     │
                          │        ├── Swap · Pool · Yield               │
                          │        ├── Bridge (CCTP) · Gateway           │
                          │        └── Dashboard · Analytics · Docs      │
                          └───────┬───────────────┬──────────────┬───────┘
                                  │               │              │
                    Circle SDKs   │   Arc RPC     │   Explorer    │  Backend
        (modular / w3s / gateway) │ (reads/writes)│  (event ETL)  │ (/api/uc)
                                  │               │              │
                          ┌───────▼───────┐ ┌─────▼──────┐ ┌──────▼─────────┐
                          │  Arc Network  │ │  ArcScan   │ │ Express server │
                          │  (Circle L1)  │ │  indexer   │ │ Dev/UC wallets │
                          └───────────────┘ └────────────┘ └────────────────┘
```

**Deployable units:**

| Unit | Path | Description |
| --- | --- | --- |
| **Frontend** | `/` (root) | React SPA — all user-facing protocol surfaces |
| **Backend** | `/server` | Express service for Circle User-Controlled & Developer-Controlled wallets (holds the entity secret server-side) |
| **MCP Server** | `/mcp-server` | Model Context Protocol server exposing Lunex to AI agents |
| **Contracts** | `/contracts` | Solidity peripherals (limit-order keeper, stream, top-up relayer) + interfaces |

On-chain analytics are derived by a deterministic indexer (`/scripts`) that reads Lunex contract event logs from Arc's explorer with retry/backoff, decodes them, and feeds both the in-app `/analytics` page and the Dune dashboard.

---

## 🧰 Tech Stack

| Layer | Technologies |
| --- | --- |
| **Framework** | React 18, Vite, TypeScript |
| **Styling** | Tailwind CSS, Radix UI, shadcn/ui, Framer Motion, Recharts |
| **Onchain** | wagmi, viem, RainbowKit (WalletConnect) |
| **Circle SDKs** | `modular-wallets-core`, `w3s-pw-web-sdk`, `unified-balance-kit`, `adapter-viem-v2`, `app-kit`, `developer-controlled-wallets`, `user-controlled-wallets` |
| **State / Data** | TanStack Query, React Router, Supabase (optional) |
| **Backend** | Node.js, Express, viem |
| **Agents** | Model Context Protocol (`@modelcontextprotocol/sdk`) |
| **Tooling** | ESLint, Vitest, vite-plugin-node-polyfills |

---

## 📁 Project Structure

```
Lunex-dApp/
├── src/
│   ├── pages/                 # Route pages: Swap, PoolOverview, YieldOverview,
│   │                          #   VaultDetail, Bridge, Dashboard, Analytics,
│   │                          #   ProtocolStats, Docs, LunexSDK, Landing …
│   ├── features/bridge/       # CCTP + Gateway feature module
│   │   ├── components/         #   ChainSelector, GatewayPanel, BridgeWalletBar,
│   │   │                       #   BridgeProgress, BridgeRecoveryPanel, History
│   │   ├── hooks/              #   useBridge, useGateway, useUnifiedBalance,
│   │   │                       #   useAttestation, useBridgeResume, on-chain history
│   │   └── config/             #   bridgeConfig.ts (chains, CCTP domains)
│   ├── context/               # WalletProvider (passkey / email / injected)
│   ├── hooks/                 # useSwap, useLiquidity, useVault, usePoolData,
│   │                          #   useVaultData, useSectionHistory (on-chain) …
│   ├── lib/                   # circleWallet, circleUserWallet, circleTx,
│   │                          #   arcLogs, onchainAnalytics, walletActivity, errors
│   ├── config/               # wagmi.ts (chains, tokens, contracts), abis.ts
│   ├── components/            # UI primitives, WalletButton, WalletSearch, layout
│   └── integrations/         # Supabase client (optional)
├── server/                   # Express backend (Circle UC + dev-controlled wallets)
├── mcp-server/               # MCP server for AI agents
├── contracts/                # Solidity peripherals + interfaces
├── scripts/                  # Dune ETL + on-chain aggregate generators
├── dune/                     # Dune SQL queries + dashboard guide
└── public/                   # Static assets
```

---

## 📜 Smart Contracts

Core protocol contracts on **Arc Testnet** (explorer: [`testnet.arcscan.app`](https://testnet.arcscan.app)):

| Contract | Address |
| --- | --- |
| **StableSwap Pool** | `0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8` |
| **LP Token** | `0x090BBEb2690eC75633f1804865D99a3143DB8042` |
| **luneUSDC Vault** (ERC-4626) | `0x66CF9CA9D75FD62438C6E254bA35E61775EF9496` |
| **luneEURC Vault** (ERC-4626) | `0xcF2C839B12ECf6D9eEcd4607521B73fcFb7E8713` |
| **Limit Order Keeper** | `0x206D5E8f126ba083b8274fd46834801aF8CB9451` |
| **Stream** | `0x131212B79e47C94Bce428509B4372EA85Be7B304` |

**Assets** — USDC `0x3600…0000` · EURC `0x89B5…D72a` (both 6 decimals).

> All core contracts will undergo third-party audit and a bug-bounty program prior to Arc mainnet.

---

## 🔗 Supported Networks

Lunex is deployed on **Arc Testnet** and bridges USDC to/from five additional CCTP testnets:

| Network | Chain ID | CCTP Domain |
| --- | --- | --- |
| **Arc Testnet** (native) | 5042002 | 26 |
| Ethereum Sepolia | 11155111 | 0 |
| Avalanche Fuji | 43113 | 1 |
| Arbitrum Sepolia | 421614 | 3 |
| Base Sepolia | 84532 | 6 |
| Polygon PoS Amoy | 80002 | 7 |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 20 and **npm** (a `.nvmrc` pins the version)
- A WalletConnect Project ID ([cloud.reown.com](https://cloud.reown.com)) for the bridge / Gateway flows
- _(Optional)_ Circle Developer Console keys for passkey & email wallets

### Install & run

```bash
# 1. Clone
git clone https://github.com/lunex-app/Lunex-dApp.git
cd Lunex-dApp

# 2. Install (the project uses legacy peer deps)
npm install --legacy-peer-deps

# 3. Configure environment
cp .env.example .env      # then fill in the values (see below)

# 4. Start the dev server
npm run dev               # http://localhost:8080

# 5. Production build
npm run build
npm run preview
```

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | ESLint |
| `npm run test` | Run the Vitest suite |
| `npm run mcp` | Start the MCP agent server |

---

## 🔑 Environment Variables

All frontend config is read from the environment (`VITE_*`, baked at build time). Only non-secret public values (e.g. the Arc public RPC) have committed fallbacks.

```bash
# ── Circle Modular Wallet (passkey, gasless) ──────────────────────────
VITE_CIRCLE_CLIENT_KEY=          # from console.circle.com → Modular Wallets
VITE_CIRCLE_CLIENT_URL=          # modular SDK RPC URL
VITE_CIRCLE_CHAIN_PATH=arcTestnet

# ── Circle User-Controlled Wallet (email/PIN) ─────────────────────────
VITE_CIRCLE_UC_APP_ID=           # public App ID
VITE_API_URL=                    # URL of the /server backend (Railway, etc.)

# ── WalletConnect (RainbowKit) ────────────────────────────────────────
VITE_WALLETCONNECT_PROJECT_ID=   # public project id (bridge / Gateway EOAs)

# ── Arc RPC ───────────────────────────────────────────────────────────
VITE_ARC_RPC_URL=                # dedicated RPC (falls back to Arc public RPC)

# ── Supabase (optional) ───────────────────────────────────────────────
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

> **Never** place the Circle **entity secret** or **API key** in the frontend — they live only in the backend (`/server/.env`, gitignored).

---

## 🖥️ Backend Service

The `/server` Express app powers the email/PIN (User-Controlled) and Developer-Controlled wallet flows, keeping Circle's entity secret server-side.

```bash
cd server
cp .env.example .env             # CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, ARC_RPC_URL, …
npm install --legacy-peer-deps
npm start                        # exposes /api/uc/* and /health
```

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Liveness check |
| `GET /api/uc/enabled` | Whether UC wallets are configured |
| `POST /api/uc/email-token` | Begin email-OTP login |
| `POST /api/uc/pin-setup` | Create the set-PIN + wallet challenge |
| `POST /api/uc/execute` | Build a contract-execution (PIN) challenge |

The dev-controlled wallet is provisioned once with `npm run create-wallet`.

---

## 📈 Analytics & Indexing

Arc is not natively indexed by third-party analytics platforms, so Lunex ships its **own deterministic indexer**. The scripts in `/scripts` read Lunex contract event logs from Arc's explorer (with retry/backoff so partial pages never produce wrong totals), decode them, and emit aggregates.

- **In-app:** [`/analytics`](https://lunex.finance/analytics) — fully on-chain, no off-chain database.
- **Dune:** [Lunex Protocol — Arc Analytics](https://dune.com/lunexfinance1264/lunex-protocol-arc-analytics) — built from the same data via `scripts/dune-build-data.mjs` and the queries in `/dune`.

```bash
node scripts/dune-export.mjs       # export Dune-ready CSVs
node scripts/dune-build-data.mjs   # full-history aggregates → JSON
node scripts/dune-wallets.mjs      # per-wallet leaderboard + lookup SQL
```

---

## 🤖 MCP Server (Agent Interface)

`/mcp-server` exposes Lunex to AI agents over the **Model Context Protocol**, enabling autonomous research and execution (read pools / TVL / APY, fetch unified balances, encode swap intents). This underpins the planned **Auto-Treasury** and **Autopilot** agent products.

```bash
npm run mcp
```

---

## ☁️ Deployment

| Component | Recommended host |
| --- | --- |
| **Frontend** | Netlify or Vercel (set the `VITE_*` env vars; build `npm run build`, output `dist/`) |
| **Backend** | Railway (set `CIRCLE_*` + `ARC_RPC_URL`) |

A `netlify.toml`, `.nvmrc`, and `.npmrc` (legacy-peer-deps) are included so CI installs succeed out of the box. Frontend env vars are **build-time** — set them in the host dashboard, then trigger a clean build.

> **Passkey domains:** Circle Modular Wallet client keys are domain-allowlisted. Add your production domain in the Circle Console → Modular Wallets allowed domains, or passkey login will return "Invalid credentials".

---

## 🔒 Security

- **Non-custodial.** Users hold their own keys (passkey device credential, PIN-secured Circle wallet, or self-custodial EOA).
- **No wrapped-asset risk** on bridging — CCTP uses native burn-and-mint with Circle attestations.
- **Secrets isolation.** The Circle entity secret and API key live only in the backend; the frontend bundle ships no secrets.
- **OpenZeppelin** libraries for ERC-20 / ERC-4626, reentrancy guards on state-changing operations, and role-based admin access.
- **Mainnet preparation:** third-party audit, bug bounty, and time-locked multi-sig governance before mainnet launch.

---

## 🗺️ Roadmap

- **Now (Testnet):** StableSwap, vaults, CCTP bridge, Gateway, Circle Wallets + Gas Station, on-chain analytics — all live.
- **Milestone 1 — Mainnet & Lunex FX:** third-party audit → Arc mainnet deploy; production CCTP; **Lunex FX** powered by Circle **StableFX**.
- **Milestone 2 — Agentic:** **Auto-Treasury** + **Autopilot** (agent-native via MCP/SDK) using **x402 nanopayments** and **CCTP v2 Hooks**; add **Paymaster** and **Compliance Engine** for institutional readiness.

---

## 📄 License

Released under the **MIT License**.

---

<div align="center">

**Lunex Finance** — _Institution-grade stablecoin rails, built on Arc and powered by Circle._

[Website](https://lunex.finance) · [App](https://lunex.finance/dashboard) · [Analytics](https://lunex.finance/analytics) · [Dune](https://dune.com/lunexfinance1264/lunex-protocol-arc-analytics) · [Docs](https://lunex.finance/docs) · [X](https://x.com/lunexfinance)

</div>
