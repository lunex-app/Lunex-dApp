# Lunex Finance

Lunex Finance is a decentralised exchange (DEX) protocol on **Arc Network** (Circle's stablecoin L1). It combines a Curve-style **StableSwap AMM** optimised for stablecoin pairs (USDC/EURC) with **ERC-4626 yield vaults**, a **Circle CCTP v2 bridge**, and **Circle Gateway** for instant cross-chain USDC — wrapped in a clean, mobile-friendly app shell.

## Features

- **Swap** — Curve-style StableSwap with near-zero slippage between USDC and EURC, on-chain quotes, and slippage protection.
- **Liquidity Pools** — Provide USDC/EURC liquidity to earn swap fees; add/remove with slippage-guarded `minMint`/`minAmounts`.
- **Yield Vaults** — ERC-4626 vaults (luneUSDC / luneEURC) for auto-compounding stablecoin yield.
- **Cross-Chain Bridge (Circle CCTP v2)** — Move USDC/EURC across Ethereum, Base, Arbitrum, Avalanche, Polygon and Arc. Includes **Transfer**, **Gateway**, on-chain **History**, and **Recovery** for stuck transfers.
- **Circle Gateway (Forwarding Service)** — Deposit once, then mint USDC instantly on a destination chain via Circle's Forwarding Service (no source-chain finality wait), or manual mint.
- **Circle Wallet logins** — **Passkey** (Circle Modular Wallets, gasless smart accounts) and **Email + PIN** (Circle User-Controlled Wallets), plus an injected EOA fallback.

## Technology Stack

- **Frontend**: React (Vite), TypeScript, Tailwind CSS, Radix UI, Framer Motion
- **Web3**: Wagmi, Viem
- **Wallets**: Circle Modular Wallets (`@circle-fin/modular-wallets-core`), Circle User-Controlled Wallets (`@circle-fin/w3s-pw-web-sdk`), Circle Gateway (`@circle-fin/unified-balance-kit`)
- **Backend** (`server/`): Node + Express, Circle User-Controlled Wallets + Developer-Controlled Wallets SDKs
- **Data**: Supabase (stats / maintenance / API keys)

## Quickstart

```bash
git clone <repository_url>
cd Lunex-dApp
npm install            # Node 20+ recommended
npm run dev            # http://localhost:5173
```

The repo ships an `.npmrc` (`legacy-peer-deps=true`) so installs don't abort on the wagmi/Circle peer-dependency tree.

## Environment

Create a `.env` at the repo root (see `.env.example`). All `VITE_*` vars are **build-time** — they must be set wherever you build/deploy:

```bash
# Supabase (public anon keys)
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

# Arc testnet RPC (a dedicated endpoint is strongly recommended)
VITE_ARC_RPC_URL=

# Circle Modular Wallet (passkey) — public client key + URL from console.circle.com → Modular Wallets
VITE_CIRCLE_CLIENT_KEY=
VITE_CIRCLE_CLIENT_URL=
VITE_CIRCLE_CHAIN_PATH=arcTestnet

# Circle User-Controlled Wallet (email/PIN) — public App ID + the backend URL
VITE_CIRCLE_UC_APP_ID=
VITE_API_URL=            # URL of the server/ backend (see below)
```

> The Circle **entity secret** and **API key** are server-only and must **never** appear in the frontend or `VITE_*` vars.

## Backend (`server/`)

The email/PIN (User-Controlled Wallet) flow needs a small backend that holds the Circle entity secret and exposes `/api/uc/*`. It also hosts the one-time developer-controlled wallet setup used by the auto-compound harvester.

```bash
cd server
cp .env.example .env     # fill in CIRCLE_* secrets
npm install
npm start                # http://localhost:8787
```

Server env (set these on your host, not in the frontend):

```
CIRCLE_UC_API_KEY=        CIRCLE_UC_ENTITY_SECRET=     CIRCLE_UC_APP_ID=
CIRCLE_UC_BLOCKCHAIN=ARC-TESTNET   CIRCLE_UC_ACCOUNT_TYPE=SCA
ARC_RPC_URL=              PORT=8787
```

## Architecture

- `src/pages` — routes (Landing is standalone; the rest render inside the sidebar shell `components/layout/AppLayout.tsx`).
- `src/features/bridge` — CCTP bridge, Gateway, history (`useOnchainBridgeHistory`), recovery (`useBridgeResume`).
- `src/context/WalletProvider.tsx` — unified wallet state; `signer = passkey ?? uc`.
- `src/lib` — `circleWallet.ts` (passkey), `circleUserWallet.ts` (email/PIN), `circleTx.ts` + `hooks/useTx.ts` (signer-aware write routing), `errors.ts` (friendly error messages).
- `src/config/wagmi.ts` — Arc chain + contract registry; injected-connector wagmi config (no WalletConnect).

## Deployment

**Frontend → Netlify / Vercel.** The repo includes `netlify.toml` and `vercel.json` (build `npm run build`, publish `dist`, SPA redirect, Node 20, legacy-peer-deps). Set all `VITE_*` env vars in the host's dashboard.

**Backend → Railway** (or any Node host). From `server/`: `railway up`. Set the `CIRCLE_*` + `ARC_RPC_URL` vars on the service, then point the frontend's `VITE_API_URL` at the deployed backend URL.

## License

Copyright © 2026 Lunex Finance. All rights reserved.
