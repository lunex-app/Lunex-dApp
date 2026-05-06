import { useState, useMemo } from "react";
import { Search, BookOpen, ChevronRight, ExternalLink } from "lucide-react";
import BackButton from "@/components/BackButton";

interface DocSection {
  id: string;
  title: string;
  content: string;
}

interface DocCategory {
  id: string;
  category: string;
  icon: string;
  sections: DocSection[];
}

const docs: DocCategory[] = [
  {
    id: "overview",
    category: "Getting Started",
    icon: "🚀",
    sections: [
      {
        id: "what-is-lunex",
        title: "What is Lunex",
        content: `Lunex is a decentralised exchange (DEX) protocol built on Arc Network. It combines a Curve-style StableSwap AMM optimised for stablecoin pairs with ERC-4626 yield vaults.

Key capabilities:
  Near-zero slippage swaps between USDC and EURC
  ERC-4626 compliant yield vaults with auto-compounding
  On-chain transparency on Arc Testnet explorer
  Cross-chain bridging via Circle CCTP
  RESTful DEX adapter (Lunex SDK) for aggregator integrations

Currently live on Arc Network Testnet (Chain ID: 5042002).`,
      },
      {
        id: "quickstart",
        title: "Quick Start Guide",
        content: `1. Install a Web3 wallet (MetaMask, Rabby, Coinbase Wallet)

2. Add Arc Network Testnet:
   Network Name: Arc Testnet
   Chain ID: 5042002
   RPC URL: https://rpc.testnet.arc.network
   Block Explorer: https://testnet.arcscan.app
   Native Currency: USDC

3. Get testnet tokens from faucet.circle.com

4. Visit the app and click "Connect" in the navbar

5. Start using Swap, Pool, Yield, Bridge, or Stats features`,
      },
    ],
  },
  {
    id: "swap",
    category: "Swap",
    icon: "🔄",
    sections: [
      {
        id: "how-swap-works",
        title: "How Swapping Works",
        content: `The Swap feature lets you exchange USDC for EURC and vice versa using the StableSwap invariant, a bonding curve designed for assets that trade near 1:1.

Steps:
1. Select the token to sell (From) and receive (To)
2. Enter the amount. Output is calculated using live on-chain pricing
3. Review exchange rate, price impact, and minimum received
4. Click "Approve" to grant token spending permission (first time only)
5. Click "Swap" to execute

The swap is atomic: the full trade succeeds or reverts entirely.`,
      },
      {
        id: "slippage",
        title: "Slippage Tolerance",
        content: `Slippage tolerance is the maximum price deviation you accept between the quote and execution.

Presets: 0.1%, 0.5%, 1.0% (or custom)

How it works: The protocol calculates a "minimum received" amount. If actual output falls below this threshold, the transaction reverts.

Recommendations:
  0.1%: Best for USDC/EURC (low volatility)
  0.5%: Good default for moderate activity
  1.0%: Use during high-traffic periods`,
      },
      {
        id: "price-impact",
        title: "Price Impact",
        content: `Price impact measures how much your trade moves the pool's exchange rate.

Levels:
  Green (< 0.1%): Virtually no impact
  Yellow (0.1% to 1.0%): Acceptable for most trades
  Red (> 1.0%): Consider splitting into smaller amounts

The StableSwap curve minimises impact for pegged assets. Most trades under $50,000 have negligible impact.

Note: Price impact is deterministic (based on trade size), while slippage accounts for changes between quote and execution.`,
      },
    ],
  },
  {
    id: "pool",
    category: "Liquidity Pool",
    icon: "💧",
    sections: [
      {
        id: "providing-liquidity",
        title: "Providing Liquidity",
        content: `Deposit USDC and/or EURC into the StableSwap pool to receive LP tokens representing your proportional share.

Steps:
1. Navigate to Pool > Add Liquidity
2. Enter amounts (single-sided or dual-sided)
3. Approve each token (first time)
4. Click "Add Liquidity" to mint LP tokens

Benefits:
  Earn a share of swap fees from every trade
  LP tokens appreciate as fees accumulate
  No lock-up period; withdraw anytime`,
      },
      {
        id: "removing-liquidity",
        title: "Removing Liquidity",
        content: `Withdraw deposited assets at any time by burning LP tokens.

Steps:
1. Navigate to Pool > Remove Liquidity
2. Select withdrawal percentage (25%, 50%, 75%, or 100%)
3. Choose mode: Both tokens, USDC only, or EURC only
4. Approve LP tokens if needed
5. Click "Remove Liquidity"

Single-sided withdrawals may have slightly higher slippage as the pool rebalances.`,
      },
      {
        id: "lp-tokens",
        title: "LP Tokens and Fee Accrual",
        content: `LP tokens are ERC-20 tokens representing pool ownership.

Fee mechanics:
  Each swap charges a 4.00% fee
  Fees are added directly to pool reserves
  LP token value increases over time
  No manual claiming required

Example: Deposit $1,000, fees accumulate 1% = LP tokens redeemable for $1,010.

LP tokens are transferable and composable with other DeFi protocols.`,
      },
    ],
  },
  {
    id: "yield",
    category: "Yield Vaults",
    icon: "🏦",
    sections: [
      {
        id: "vault-design",
        title: "ERC-4626 Vault Design",
        content: `Lunex yield vaults follow the ERC-4626 Tokenised Vault Standard.

Available vaults:
  USDC Vault: Deposit USDC, receive luneUSDC shares
  EURC Vault: Deposit EURC, receive luneEURC shares

Flow:
1. Deposit underlying tokens into the vault
2. Vault mints share tokens proportional to your deposit
3. Vault strategy generates yield on deposited assets
4. Share price increases as yield accrues
5. Withdraw: shares are burned, you receive underlying + accumulated yield`,
      },
      {
        id: "deposit-withdraw",
        title: "Depositing and Withdrawing",
        content: `Depositing:
1. Go to Yield > select vault (USDC or EURC)
2. Enter deposit amount
3. Approve token (first time only)
4. Click "Deposit" to receive share tokens

Withdrawing:
1. Go to Yield > select vault > Withdraw tab
2. Enter amount of underlying tokens to receive
3. Click "Withdraw" to burn shares

No withdrawal fee or lock-up period. Withdrawals are instant and atomic.`,
      },
      {
        id: "share-price",
        title: "Share Price and Yield",
        content: `Share Price = Total Assets in Vault / Total Shares Outstanding

Example:
  Launch: share price = 1.0000 (1 share = 1 USDC)
  After yield: share price = 1.0500 (1 share = 1.05 USDC)
  1,000 shares = now worth 1,050 USDC

The share price only increases under normal operation. APY will be displayed on mainnet once sufficient data is available.`,
      },
    ],
  },
  {
    id: "bridge",
    category: "Bridge",
    icon: "🌉",
    sections: [
      {
        id: "cross-chain",
        title: "Cross-Chain Bridging",
        content: `Bridge USDC between chains using Circle's Cross-Chain Transfer Protocol (CCTP).

Supported chains:
  Arc Testnet (destination)
  Ethereum Sepolia
  Arbitrum Sepolia
  Polygon PoS Amoy
  Avalanche Fuji
  Base Sepolia

Flow:
1. Select source chain and enter USDC amount
2. Approve USDC for burning
3. Burn USDC on source chain
4. Wait for Circle attestation (~2-5 minutes)
5. Mint USDC on Arc Testnet

Transactions can be resumed if interrupted. Bridge history tracks all past and pending transfers.`,
      },
    ],
  },
  {
    id: "sdk",
    category: "Lunex SDK (DEX Adapter)",
    icon: "🔧",
    sections: [
      {
        id: "sdk-overview",
        title: "SDK Overview",
        content: `The Lunex SDK is a RESTful API that enables DEX aggregators and external applications to integrate with the Lunex protocol programmatically.

Base URL: https://<project-ref>.supabase.co/functions/v1

Endpoints:
  GET  /dex-adapter-info    Discovery and metadata (no auth)
  GET  /dex-quote            Get swap quotes
  POST /dex-swap             Generate unsigned swap transactions
  GET  /dex-liquidity        Pool reserves, TVL, LP supply
  GET  /dex-price            Current exchange rates with 24h data
  POST /dex-webhook          Register reserve change webhooks
  GET  /dex-webhook          List registered webhooks
  DELETE /dex-webhook?id=    Remove a webhook

All endpoints except /dex-adapter-info require an API key via the x-api-key header.`,
      },
      {
        id: "sdk-auth",
        title: "Authentication",
        content: `All SDK endpoints (except /dex-adapter-info) require API key authentication.

Header: x-api-key: <your-api-key>

API keys are configured as a comma-separated list in the DEX_API_KEYS backend secret.

Example:
  curl -H "x-api-key: your-key" \\
    https://your-project.supabase.co/functions/v1/dex-quote?tokenIn=0x36...&tokenOut=0x89...&amountIn=1000000

If no API keys are configured, the endpoints operate in dev mode (all requests allowed).`,
      },
      {
        id: "sdk-rate-limits",
        title: "Rate Limits",
        content: `Each endpoint has per-key rate limiting:

  /dex-quote:      60 requests/minute
  /dex-swap:       30 requests/minute
  /dex-liquidity: 120 requests/minute
  /dex-price:     120 requests/minute

Response headers:
  X-RateLimit-Limit:     Max requests per window
  X-RateLimit-Remaining: Requests remaining
  X-RateLimit-Reset:     Unix timestamp when window resets

When exceeded, the API returns HTTP 429 with a JSON error body.`,
      },
      {
        id: "sdk-quote",
        title: "GET /dex-quote",
        content: `Get a real-time swap quote from the on-chain pool.

Parameters:
  tokenIn   (required): Token address to sell
  tokenOut  (required): Token address to buy
  amountIn  (required): Amount in smallest unit (e.g. 1000000 = 1 USDC)
  slippage  (optional): Percentage, default 0.5

Supported tokens:
  USDC: 0x3600000000000000000000000000000000000000
  EURC: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a

Example request:
  GET /dex-quote?tokenIn=0x3600...&tokenOut=0x89B5...&amountIn=1000000

Example response:
  {
    "success": true,
    "data": {
      "amountOut": "995200",
      "priceImpact": 0.0012,
      "route": [{ "protocol": "Lunex", "pool": "0xC24B..." }],
      "estimatedGas": "150000",
      "fees": { "swapFeePercent": "4.0000", "protocolFee": "0" }
    }
  }

Error cases:
  400: Missing parameters, unsupported tokens, same token in/out, zero amount
  429: Rate limit exceeded
  500: RPC or internal error`,
      },
      {
        id: "sdk-swap",
        title: "POST /dex-swap",
        content: `Generate unsigned transaction data for a swap (approve + exchange).

Request body (JSON):
  {
    "walletAddress": "0x...",   // required, must be valid address
    "tokenIn": "0x...",         // required
    "tokenOut": "0x...",        // required
    "amountIn": "1000000",      // required, smallest unit
    "slippage": 0.5             // optional, default 0.5%
  }

Response:
  {
    "success": true,
    "data": {
      "approveTransaction": {
        "to": "0x3600...",
        "data": "0x095ea7b3...",
        "value": "0x0",
        "chainId": 5042002,
        "gasLimit": "60000"
      },
      "swapTransaction": {
        "to": "0xC24B...",
        "data": "0x5b41b908...",
        "value": "0x0",
        "chainId": 5042002,
        "gasLimit": "250000"
      },
      "expectedOutput": "995200",
      "minimumOutput": "990224",
      "slippagePercent": 0.5
    }
  }

Integration flow:
1. Call /dex-swap to get transaction data
2. Submit approveTransaction via user's wallet
3. Wait for approval confirmation
4. Submit swapTransaction via user's wallet`,
      },
      {
        id: "sdk-liquidity",
        title: "GET /dex-liquidity",
        content: `Returns current pool state including reserves, TVL, fee, and LP token data.

No parameters required.

Response:
  {
    "success": true,
    "data": {
      "pool": {
        "address": "0xC24B...",
        "type": "StableSwap (Curve-style)",
        "fee": { "raw": "4000000", "percent": "4.0000" }
      },
      "reserves": [
        { "symbol": "USDC", "address": "0x3600...", "reserveFormatted": "925.850000" },
        { "symbol": "EURC", "address": "0x89B5...", "reserveFormatted": "925.860000" }
      ],
      "tvl": { "usd": "1851.71", "formatted": "$1,851.71" },
      "lpToken": {
        "address": "0x...",
        "totalSupplyFormatted": "1851.710000"
      }
    }
  }`,
      },
      {
        id: "sdk-price",
        title: "GET /dex-price",
        content: `Returns the current USDC/EURC exchange rate with 24h price tracking.

No parameters required.

Response:
  {
    "success": true,
    "data": {
      "pair": "USDC/EURC",
      "prices": {
        "usdcToEurc": { "rate": "0.995200", "inverseRate": "1.004824" },
        "eurcToUsdc": { "rate": "0.995180", "inverseRate": "1.004844" }
      },
      "change24h": { "percent": "0.0100", "direction": "up", "dataPoints": 42 },
      "range24h": { "high": "0.995300", "low": "0.995100" },
      "pool": {
        "fee": "4.0000%",
        "usdcReserve": "925.85",
        "eurcReserve": "925.86",
        "tvl": "1851.71"
      }
    }
  }

Note: 24h data accumulates from the edge function's first invocation. Data resets if the serverless isolate restarts.`,
      },
      {
        id: "sdk-webhook",
        title: "Webhooks",
        content: `Register webhooks to receive POST notifications when pool reserves change significantly.

Register a webhook:
  POST /dex-webhook
  Body:
  {
    "url": "https://your-server.com/webhook",
    "events": ["reserve_change"],
    "thresholdPercent": 5
  }

  Response: { "success": true, "data": { "id": "uuid", ... } }

List your webhooks:
  GET /dex-webhook

Remove a webhook:
  DELETE /dex-webhook?id=<webhook-id>

Webhook payload (sent to your URL):
  {
    "event": "reserve_change",
    "protocol": "Lunex",
    "pool": "0xC24B...",
    "previous": { "usdc": 925.85, "eurc": 925.86 },
    "current": { "usdc": 880.10, "eurc": 971.61 },
    "changePercent": { "usdc": "4.9400", "eurc": "4.9400" },
    "timestamp": "2026-03-29T12:00:00.000Z"
  }

Webhooks are stored in-memory per edge function isolate. For production, persist webhook registrations in a database.`,
      },
      {
        id: "sdk-integration",
        title: "Integration Guide",
        content: `Step-by-step for DEX aggregators:

1. Discovery: Call GET /dex-adapter-info to discover tokens, endpoints, and rate limits

2. Check Liquidity: Call GET /dex-liquidity to verify pool TVL and reserve balances

3. Get Price: Call GET /dex-price for current exchange rates

4. Quote: Call GET /dex-quote with token addresses and amount to get expected output, price impact, and fees

5. Build Transaction: Call POST /dex-swap with wallet address and trade parameters to receive unsigned transaction data

6. Execute:
   a. Submit the approveTransaction to the user's wallet
   b. Wait for confirmation
   c. Submit the swapTransaction to the user's wallet

7. (Optional) Monitor: Register a webhook via POST /dex-webhook to get notified of significant reserve changes

Supported tokens:
  USDC: 0x3600000000000000000000000000000000000000 (6 decimals)
  EURC: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a (6 decimals)

Pool: 0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8
Chain: Arc Testnet (5042002)
RPC: https://rpc.testnet.arc.network`,
      },
    ],
  },
  {
    id: "technical",
    category: "Technical Architecture",
    icon: "⚙️",
    sections: [
      {
        id: "stableswap",
        title: "StableSwap AMM (Curve Model)",
        content: `Lunex uses a Curve-style StableSwap invariant combining constant-product (x*y=k) with constant-sum (x+y=k) for a hybrid curve.

Invariant: A*n^n*sum(xi) + D = A*D*n^n + D^(n+1) / (n^n*prod(xi))

Where:
  A = amplification coefficient (controls curve flatness near peg)
  n = number of tokens (2 for USDC/EURC)
  D = total deposits invariant
  xi = individual token balances

Higher A = flatter curve near peg = lower slippage for pegged assets. This is optimal for stablecoin pairs where both assets target ~1:1.`,
      },
      {
        id: "contracts",
        title: "Smart Contracts",
        content: `Four core contracts on Arc Network Testnet:

1. StableSwapPool: AMM handling swaps, liquidity, and fees. Implements StableSwap invariant with configurable amplification.

2. USDC Vault (ERC-4626): Tokenised vault for USDC. Mints luneUSDC shares. Full ERC-4626: deposit(), withdraw(), redeem(), convertToAssets(), convertToShares().

3. EURC Vault (ERC-4626): Same architecture for EURC. Mints luneEURC shares.

4. LP Token (ERC-20): Standard ERC-20 minted on liquidity provision. Represents proportional pool ownership.

All contracts are verified on Arc Testnet explorer (https://testnet.arcscan.app).`,
      },
      {
        id: "erc4626",
        title: "ERC-4626 Standard",
        content: `ERC-4626 is the Ethereum standard for tokenised yield-bearing vaults.

Key functions:
  deposit(assets, receiver): Deposit underlying, receive shares
  withdraw(assets, receiver, owner): Burn shares for specific underlying amount
  redeem(shares, receiver, owner): Burn specific share count
  convertToAssets(shares): Preview underlying value
  convertToShares(assets): Preview shares for deposit
  totalAssets(): Total underlying held by vault
  previewDeposit(assets) / previewWithdraw(assets): Simulate operations

Benefits: Composability with any DeFi protocol, full on-chain transparency, standardised interface reduces integration risk.`,
      },
      {
        id: "network",
        title: "Network and Gas",
        content: `Arc Network is an EVM-compatible L2 for high-throughput, low-cost transactions.

Details:
  Chain ID: 5042002 (Testnet)
  RPC: https://rpc.testnet.arc.network
  Explorer: https://testnet.arcscan.app
  Gas token: USDC (native gas)

Typical costs:
  Swap: ~0.001 USDC
  Add Liquidity: ~0.002 USDC
  Vault Deposit: ~0.001 USDC
  Token Approval: ~0.0005 USDC

All gas fees are paid in USDC. No separate gas token needed.`,
      },
      {
        id: "security",
        title: "Security",
        content: `Current measures:
  All contracts verified on block explorer
  OpenZeppelin libraries for ERC-20 and ERC-4626
  Reentrancy guards on all state-changing functions
  Access control on admin functions

Planned for mainnet:
  Full third-party smart contract audit
  Bug bounty program
  Time-locked admin functions
  Multi-sig wallet for governance
  Emergency pause functionality

Testnet contracts may be updated without notice. Do not use real funds.`,
      },
    ],
  },
  {
    id: "faq",
    category: "FAQ",
    icon: "❓",
    sections: [
      {
        id: "faq-main",
        title: "Frequently Asked Questions",
        content: `Q: Is Lunex audited?
A: Currently on testnet. Full audit before mainnet launch.

Q: What fees does the protocol charge?
A: The StableSwap pool charges 4.00% per swap, going entirely to LPs. No protocol-level fees.

Q: Can I lose money providing liquidity?
A: The StableSwap curve minimises impermanent loss for pegged assets, but risk exists if a stablecoin depegs.

Q: What is the APY on yield vaults?
A: Not displayed on testnet. Will be calculated from actual vault performance on mainnet.

Q: How do I get testnet tokens?
A: Visit faucet.circle.com for testnet USDC. Then swap for EURC on Lunex.

Q: Where can I see transactions?
A: Each page shows recent history. Dashboard shows all activity.

Q: Is there a token or governance?
A: Not yet. Being explored for future development.

Q: Which wallets are supported?
A: Any EVM-compatible wallet: MetaMask, Rabby, Coinbase Wallet, WalletConnect, etc.`,
      },
    ],
  },
  {
    id: "mcp",
    category: "Model Context Protocol (MCP)",
    icon: "🤖",
    sections: [
      {
        id: "mcp-overview",
        title: "What is Lunex MCP?",
        content: `The Lunex Model Context Protocol (MCP) server is a gateway for AI agents (like Claude, ChatGPT, or autonomous bots) to interact directly with the Lunex protocol.

It follows the Model Context Protocol standard, allowing LLMs to:
  1. Understand protocol liquidity and pool health
  2. Query unified cross-chain balances for any wallet
  3. Generate transaction data for swaps and bridging

This enables a new class of "Agentic DeFi" where bots can manage your portfolio autonomously based on your goals.`,
      },
      {
        id: "mcp-tools",
        title: "Available Agent Tools",
        content: `The MCP server exposes the following tools to AI agents:

1. get_lunex_pools:
   Returns real-time data on USDC/EURC pools, including TVL, APY, and contract addresses.

2. get_unified_balance:
   Accepts a wallet address and returns the consolidated USDC balance across all supported chains (Arc, Base, Ethereum, etc.).

3. execute_swap_intent:
   Accepts swap parameters (fromToken, toToken, amount) and returns the encoded transaction data for the user to sign.`,
      },
      {
        id: "mcp-setup",
        title: "Local Setup Guide",
        content: `To use the Lunex MCP server with a local AI client (like Claude Desktop):

1. Ensure you have Node.js and npm installed.
2. In your local Lunex project directory, the MCP server is located at /mcp-server/index.ts.
3. Configure your AI client to run the following command:
   npx tsx <absolute-path-to-lunex>/mcp-server/index.ts

Once connected, you can ask your AI: "What are the current yields on Lunex?" or "Check my unified balance across all chains."`,
      },
      {
        id: "mcp-deployment",
        title: "Hosting & Deployment",
        content: `If you don't have a VPS, the easiest way to host the Lunex MCP server is using a platform that supports persistent Node.js processes.

Recommended: Railway or Render
  - Create a new "Web Service" or "Worker".
  - Link your GitHub repository.
  - Set the start command to: npm run mcp
  - This keeps the server running 24/7 so agents can access it anytime.

Note on Vercel: Vercel is optimized for serverless functions, which are not ideal for standard stdio-based MCP servers. For Vercel hosting, you would need to implement an SSE (Server-Sent Events) transport layer.`,
      },
    ],
  },
];

const Docs = () => {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<string>("what-is-lunex");

  const filtered = useMemo(() => {
    if (!search.trim()) return docs;
    const q = search.toLowerCase();
    return docs
      .map((cat) => ({
        ...cat,
        sections: cat.sections.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.content.toLowerCase().includes(q) ||
            cat.category.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.sections.length > 0);
  }, [search]);

  const activeDoc = useMemo(() => {
    for (const cat of docs) {
      for (const s of cat.sections) {
        if (s.id === activeSection) return s;
      }
    }
    return docs[0]?.sections[0];
  }, [activeSection]);

  const isSearching = search.trim().length > 0;

  return (
    <div className="page-fade-in min-h-[calc(100vh-3.5rem)]">
      <div className="container max-w-7xl mx-auto py-8 px-4">
        <BackButton />
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold uppercase tracking-tight">Documentation</h1>
          </div>
          <p className="text-sm text-muted-foreground tracking-wider">
            Complete guide to using Lunex protocol and SDK
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-8 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search docs..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors rounded-md"
          />
        </div>

        {isSearching ? (
          /* Search Results */
          <div className="max-w-3xl">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No results found for "{search}"</p>
            ) : (
              filtered.map((cat) => (
                <div key={cat.id} className="mb-8">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                    <span>{cat.icon}</span> {cat.category}
                  </h2>
                  <div className="space-y-2">
                    {cat.sections.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setActiveSection(s.id); setSearch(""); }}
                        className="w-full text-left border border-border bg-card hover:border-primary/30 p-4 transition-colors rounded-md"
                      >
                        <p className="text-sm font-semibold text-foreground mb-1">{s.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{s.content.slice(0, 120)}...</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Main Layout: Sidebar + Content */
          <div className="flex gap-8">
            {/* Sidebar */}
            <aside className="hidden lg:block w-64 shrink-0">
              <nav className="sticky top-20 space-y-6 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
                {docs.map((cat) => (
                  <div key={cat.id}>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                      <span>{cat.icon}</span> {cat.category}
                    </p>
                    <div className="space-y-0.5">
                      {cat.sections.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setActiveSection(s.id)}
                          className={`w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
                            activeSection === s.id
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          }`}
                        >
                          {activeSection === s.id && <ChevronRight className="h-3 w-3 shrink-0" />}
                          <span className="truncate">{s.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </nav>
            </aside>

            {/* Mobile Nav */}
            <div className="lg:hidden w-full">
              <select
                value={activeSection}
                onChange={(e) => setActiveSection(e.target.value)}
                className="w-full mb-6 p-2.5 text-sm border border-border bg-card text-foreground rounded-md"
              >
                {docs.map((cat) => (
                  <optgroup key={cat.id} label={`${cat.icon} ${cat.category}`}>
                    {cat.sections.map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Content */}
            <main className="flex-1 min-w-0 hidden lg:block">
              {activeDoc && (
                <article className="border border-border bg-card rounded-md p-8">
                  <h2 className="text-xl font-bold text-foreground mb-6 tracking-tight">{activeDoc.title}</h2>
                  <div className="prose prose-sm max-w-none">
                    <pre className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-sans m-0 p-0 bg-transparent border-none">{activeDoc.content}</pre>
                  </div>
                </article>
              )}
            </main>
          </div>
        )}

        {/* Mobile content (shown below select) */}
        <div className="lg:hidden">
          {activeDoc && !isSearching && (
            <article className="border border-border bg-card rounded-md p-6">
              <h2 className="text-lg font-bold text-foreground mb-4 tracking-tight">{activeDoc.title}</h2>
              <pre className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-sans m-0 p-0 bg-transparent border-none">{activeDoc.content}</pre>
            </article>
          )}
        </div>
      </div>
    </div>
  );
};

export default Docs;
