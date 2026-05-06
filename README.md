# Lunex Finance
Lunex Finance is a decentralised exchange protocol built on Arc Network. It uses a Curve-style StableSwap AMM optimised for stablecoin pairs (USDC/EURC), providing near-zero slippage swaps.

The protocol also offers ERC-4626 yield vaults where users can deposit stablecoins and earn yield automatically.

Lunex is a decentralised exchange (DEX) protocol built on Arc Network. It combines a Curve-style StableSwap AMM optimised for stablecoin pairs with ERC-4626 yield vaults.

Lunex is a next-gen decentralized application (dApp) that provides an advanced multichain bridge, yield aggregator, and liquidity pool system. Built with cutting-edge web3 tooling, it brings a seamless, secure, and intuitive interface to decentralized finance.

## Features

- **Cross-Chain Bridge (CCTP)**: Effortlessly bridge USDC across multiple supported blockchains (Ethereum, Base, Arbitrum, Avalanche, Polygon, Optimism) without slippage via Circle's natively integrated Cross-Chain Transfer Protocol.
- **Yield Aggregator**: Automatically compound your yields natively via streamlined smart contracts. Claim your accrued LUNEX rewards right from the interface.
- **Liquidity Pools (LP)**: Provide stablecoin liquidity (e.g., USDC, EURC) to earn real-time swap fees. The transparent pool tracking dashboard estimates your real-time revenue splits seamlessly.
- **Protocol Statistics**: View live on-chain volume, total value locked (TVL), and liquidity reserve metrics directly synced with Supabase datastores.
- **Premium User Experience**: Designed to meet high-end aesthetics, Lunex uses dynamic Radix UI components, smooth Framer Motion transitions, responsive TailwindCSS styling, and integrated seamless Light/Dark mode themes.

## Technology Stack

- **Frontend**: React (Vite), TypeScript, Tailwind CSS
- **Web3**: Wagmi, Viem, RainbowKit (Wallet Connection)
- **Data & State**: React Query (@tanstack), Zustand, Radix UI Primitives
- **Animations**: Framer Motion
- **Database / Logs**: Supabase

## Quickstart & Installation

**1. Clone the repository**
```bash
git clone <repository_url>
cd lunex-finance
```

**2. Install dependencies**
Make sure you have Node installed (v18 or higher recommended).
```bash
npm install
```

**3. Run the Development Server**
```bash
npm run dev
```

The application will launch on your local host (typically `http://localhost:5173`).

## Environment Configuration

Configure your API keys by creating a `.env` file at the root. You will require keys for:
- RainbowKit (WalletConnect Project ID)
- Supabase (URL and Anonymous Key)
- Custom RPC endpoints (Optional, configurable through wagmi configs)

## Architecture

Lunex separates logic efficiently leveraging:
- `src/features`: Domain-driven component design (e.g., `bridge/`, `yield/`).
- `src/hooks`: Global custom React hooks serving decentralized reads/writes.
- `src/components`: Reusable UI elements decoupled from business logic.
- `src/config`: App-wide constant configurations (e.g., supported chains, wagmi specs).

## Deployment

To deploy onto a staging environment, run:
```bash
npm run build
```
The output will reside in the `/dist` directory. For one-click deployments, connect the repository to standard CD platforms (like Vercel or Netlify). Vercel plugins are also actively supported.

## License

Copyright © 2026 Lunex Finance. All rights reserved.
