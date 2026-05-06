# Lunex Finance: Official Protocol Documentation

## 1. Executive Summary

**Lunex Finance** is a next-generation decentralized exchange (DEX) protocol natively built on the **Arc Network**. By synthesizing a highly optimized Curve-style StableSwap AMM, zero-slippage cross-chain infrastructure, and ERC-4626 yield vaults, Lunex aims to be the premier liquidity and yield hub for the stablecoin economy.

In a Web3 landscape plagued by fragmented liquidity, steep bridging fees, and complicated interfaces, Lunex stands out by offering a **premium, frictionless user experience**. We abstract away the heavy lifting, allowing retail users and institutions alike to seamlessly bridge stablecoins, provision liquidity, and farm yields across multiple ecosystems from a single, unified dashboard.

---

## 2. The Arc Network Foundation

Lunex chose the **Arc Network** as its native home because of its revolutionary approach to blockchain infrastructure. 

Developed by Circle (the issuer of USDC), Arc is a purpose-built Layer 1 blockchain designed specifically for payments, capital markets, and institutional finance.

*   **USDC Gas Economics:** Transactions on Arc are paid natively in USDC. This gives Lunex users predictable, dollar-denominated transaction costs, entirely removing the friction of dealing with volatile L1 gas tokens (like ETH or SOL).
*   **Sub-second Finality:** Powered by the "Malachite" consensus engine, Arc delivers sub-second finality, enabling Lunex trades and yield claims to execute with speeds rivaling centralized finance engines.
*   **EVM Compatibility:** Because Arc is fully EVM compatible, Lunex’s smart contracts harness battle-tested security standards while benefiting from next-level execution speeds.

---

## 3. Core Protocol Mechanics

### 3.1. Curve-style StableSwap AMM
At the heart of the DEX is a specialized Automated Market Maker (AMM) optimized specifically for stablecoin pairs (e.g., USDC, EURC). Utilizing an invariant curve design similar to Curve Finance, this AMM drastically minimizes slippage and impermanent loss, making it highly capital-efficient for traders executing large swaps.

### 3.2. Cross-Chain Bridge (CCTP)
Liquidity fragmentation is solved via our native integration of Circle's **Cross-Chain Transfer Protocol (CCTP)**.
*   **Supported Chains:** Ethereum, Base, Arbitrum, Avalanche, Polygon, Optimism.
*   **Zero-Slippage Routing:** Users can bridge native USDC from any supported network directly into the Lunex ecosystem on Arc with 0 slippage. Rather than relying on wrapped or synthetic risk models, CCTP burns USDC on the origin chain and natively mints it on the destination chain.

### 3.3. ERC-4626 Yield Vaults
Lunex implements the ERC-4626 tokenized vault standard, giving users one-click access to complex yield-bearing strategies. 
*   **Auto-compounding:** Vaults automatically reinvest accrued swap fees and protocol incentives back into the underlying liquidity positions, maximizing APY for passive users.
*   **Standardized Composability:** Because they adhere to the ERC-4626 standard, Lunex Vault tokens can easily be plugged into other DeFi protocols as collateral or integrated into third-party money markets.

### 3.4. Liquidity Provision (LP) & Real-time Tracking
Liquidity providers (LPs) supply assets to the StableSwap pools to facilitate trading. In exchange, they earn a portion of every swap fee generated.
*   **Dashboard Transparency:** The Lunex frontend offers real-time tracking of TVL, 24h volume, and liquidity reserves, synced dynamically via a Supabase back-end. LPs can watch their revenue split compound in real-time.
*   **Reward Accrual:** Beyond transaction fees, protocol liquidity incentives (paid in the native $LUNEX token) accrue constantly and can be easily claimed directly from the user interface.

---

## 4. Technical Architecture

Lunex marries secure smart contract infrastructure with a world-class frontend.

### 4.1. The Frontend Experience
*   **Framework:** Built on **React (Vite)** with **TypeScript** for strict type safety and high performance.
*   **Design Aesthetics:** We prioritize visual excellence using **Tailwind CSS** for responsive styling alongside **Radix UI** primitives for accessible, headless components.
*   **Dynamic Animations:** **Framer Motion** drives our premium micro-animations and seamless transitions (e.g., our sleek Dark/Light mode engine).

### 4.2. Web3 & Data Integrations
*   **Wallet Connectivity:** Handled via **RainbowKit**, **Wagmi**, and **Viem**, guaranteeing secure and rapid decentralized reads/writes to the blockchain.
*   **State & Querying:** Managed via **React Query (@tanstack)** to seamlessly cache and sync on-chain data with the UI.
*   **Database & Logging:** We use **Supabase** acting as an indexed data layer. This off-chain ledger powers our protocol statistics dashboard—rapidly serving historical volumes and transaction logs without requiring taxing RPC calls.

---

## 5. Upcoming Arc SDK Integration

To broaden the scope of what is possible within the Arc ecosystem, Lunex will soon release its comprehensive integration toolkit. 

*   **Goal:** To become foundational infrastructure. This SDK will allow third-party developers, specialized AI agents, and institutional platforms to programmatically plug into Lunex's cross-chain bridging, swap routing, and yield vaults.
*   **Agentic Workflows:** Paired with Circle's upcoming x402 nanopayment tools, our SDK will enable AI agents or automated bots to execute micro-transactions, harvest yields, and auto-balance portfolios directly through the Lunex protocol—without human intervention.

---

## 6. Official Links & Deployment Details
*   **Codebase Repository:** Managed independently. Built modularly using specific feature-based folders (`src/features/bridge`, `src/features/yield`).
*   **Local Development:** Launch the local node utilizing `npm run dev` running on localhost:5173.
*   **Environment Configuration:** Demands RainbowKit (WalletConnect API keys) and Supabase database URLs for complete data hydration.

*Copyright © 2026 Lunex Finance. Built for the Decentralized Future.*
